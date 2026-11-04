/**
 * ==============================================================================
 * Financial Calculation Versioning & Freeze Engine Service
 * Phase 77: Closed-Period Immutability, Simulation Dry-Runs & Version Governance
 * ==============================================================================
 * 
 * Strict Healthcare Financial Governance:
 * - Version lifecycle governance (DRAFT, ACTIVE, FROZEN, SUPERSEDED)
 * - Accounting period freeze gates requiring Phase 76 audit readiness (>= 90)
 * - Deterministic dry-run simulation comparing proposed vs baseline models
 * - Maestro Clinical Design System: strictly Slate, Emerald, Sky, Amber, Rose
 */

export const VERSION_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  FROZEN: 'FROZEN',
  SUPERSEDED: 'SUPERSEDED',
  DEPRECATED: 'DEPRECATED'
};

export const VERSION_STATUS_CONFIG = {
  [VERSION_STATUSES.DRAFT]: {
    key: VERSION_STATUSES.DRAFT,
    label: 'Draft (In Calibration)',
    shortLabel: 'Draft',
    colorToken: 'amber',
    badgeClass: 'badge-amber',
    description: 'Under development and parameter testing; not used in production.'
  },
  [VERSION_STATUSES.ACTIVE]: {
    key: VERSION_STATUSES.ACTIVE,
    label: 'Active Production',
    shortLabel: 'Active',
    colorToken: 'sky',
    badgeClass: 'badge-sky',
    description: 'Currently applied to in-flight clinical cases and ledger postings.'
  },
  [VERSION_STATUSES.FROZEN]: {
    key: VERSION_STATUSES.FROZEN,
    label: 'Locked / Frozen',
    shortLabel: 'Frozen',
    colorToken: 'emerald',
    badgeClass: 'badge-emerald',
    description: 'Immutable baseline locked for closed accounting periods.'
  },
  [VERSION_STATUSES.SUPERSEDED]: {
    key: VERSION_STATUSES.SUPERSEDED,
    label: 'Superseded',
    shortLabel: 'Superseded',
    colorToken: 'slate',
    badgeClass: 'badge-slate',
    description: 'Prior production version retained for historical audit reproduction.'
  },
  [VERSION_STATUSES.DEPRECATED]: {
    key: VERSION_STATUSES.DEPRECATED,
    label: 'Deprecated',
    shortLabel: 'Deprecated',
    colorToken: 'rose',
    badgeClass: 'badge-rose',
    description: 'Obsolete calculation logic prohibited from future runs.'
  }
};

export const FREEZE_STATUSES = {
  OPEN: 'OPEN',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  FROZEN: 'FROZEN',
  REOPENED_AUDIT: 'REOPENED_AUDIT'
};

export const FREEZE_STATUS_CONFIG = {
  [FREEZE_STATUSES.OPEN]: {
    key: FREEZE_STATUSES.OPEN,
    label: 'Open Period',
    shortLabel: 'Open',
    colorToken: 'amber',
    badgeClass: 'badge-amber',
    description: 'Period is active; entries and margin postings may occur.'
  },
  [FREEZE_STATUSES.PENDING_APPROVAL]: {
    key: FREEZE_STATUSES.PENDING_APPROVAL,
    label: 'Pending Freeze Approval',
    shortLabel: 'Pending Approval',
    colorToken: 'sky',
    badgeClass: 'badge-sky',
    description: 'Completeness check verified; awaiting CFO final sign-off.'
  },
  [FREEZE_STATUSES.FROZEN]: {
    key: FREEZE_STATUSES.FROZEN,
    label: 'Period Closed & Frozen',
    shortLabel: 'Frozen',
    colorToken: 'emerald',
    badgeClass: 'badge-emerald',
    description: 'Immutable GAAP financial close; ledger entries locked.'
  },
  [FREEZE_STATUSES.REOPENED_AUDIT]: {
    key: FREEZE_STATUSES.REOPENED_AUDIT,
    label: 'Reopened for Audit',
    shortLabel: 'Reopened',
    colorToken: 'rose',
    badgeClass: 'badge-rose',
    description: 'Temporarily reopened under CFO override with audit stamp.'
  }
};

export function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

export const calculationVersioningService = {
  /**
   * Deterministically calculates simulation variance between baseline and recalculated margins.
   */
  calculateSimulationVariance(baselineMargin, recalculatedMargin) {
    const base = Number(baselineMargin) || 0.00;
    const recalc = Number(recalculatedMargin) || 0.00;
    const variance = roundToTwo(recalc - base);
    const variancePct = base !== 0.00 ? roundToTwo((variance / Math.abs(base)) * 100.00) : 0.00;

    return {
      baselineMargin: roundToTwo(base),
      recalculatedMargin: roundToTwo(recalc),
      variance,
      variancePct,
      isFavorable: variance >= 0.00
    };
  },

  /**
   * Validates pre-freeze completeness audit gate for an accounting period.
   */
  validatePreFreezeGate(cases = [], minScoreThreshold = 90.00) {
    const totalCases = cases.length;
    let auditReadyCount = 0;
    const blockedCases = [];

    cases.forEach(c => {
      const score = Number(c.completenessScore !== undefined ? c.completenessScore : (c.overallScore || 0));
      if (score >= minScoreThreshold) {
        auditReadyCount += 1;
      } else {
        blockedCases.push({
          caseId: c.id,
          patient: c.patient,
          score,
          missingElements: c.missingElements || ['PENDING_DOCUMENTATION']
        });
      }
    });

    const passRatePct = totalCases > 0 ? roundToTwo((auditReadyCount / totalCases) * 100.00) : 100.00;
    const canFreeze = blockedCases.length === 0;

    return {
      canFreeze,
      totalCases,
      auditReadyCount,
      blockedCount: blockedCases.length,
      blockedCases,
      passRatePct,
      minScoreThreshold
    };
  },

  /**
   * Executes a dry-run recalculation comparing two versions across a set of cases.
   */
  runSimulationDryRun(sourceVersion, targetVersion, cases = []) {
    let totalBaseline = 0;
    let totalRecalculated = 0;
    const caseDetails = [];

    cases.forEach(c => {
      const baseMargin = Number(c.expectedContributionMargin || 1400.00);
      // Simulate target model: e.g. target version incorporates updated wage rates or fee schedule adjustment
      const multiplier = targetVersion.marginMultiplier || 1.05; // e.g. +5% from updated contract
      const recalcMargin = roundToTwo(baseMargin * multiplier);
      const varData = this.calculateSimulationVariance(baseMargin, recalcMargin);

      totalBaseline += baseMargin;
      totalRecalculated += recalcMargin;

      caseDetails.push({
        caseId: c.id,
        patient: c.patient,
        procedure: c.procedure,
        cpt: c.cpt_codes,
        surgeonName: c.surgeonName,
        specialty: c.specialty,
        ...varData
      });
    });

    const overallVariance = this.calculateSimulationVariance(totalBaseline, totalRecalculated);

    return {
      runId: `SIM-${Date.now().toString().slice(-6)}`,
      sourceVersionCode: sourceVersion.versionCode || sourceVersion.version_code || '2026.1_BASELINE',
      targetVersionCode: targetVersion.versionCode || targetVersion.version_code || '2026.2_UPDATED',
      casesEvaluated: cases.length,
      overallVariance,
      caseDetails,
      executedAt: new Date().toISOString()
    };
  },

  /**
   * Generates comprehensive baseline sample data for versions, freezes, and audit history.
   */
  getBaselineSampleData() {
    const versions = [
      {
        id: 'ver-001',
        versionCode: '2026.1_BASELINE',
        versionName: 'FY2026 Q1 Authoritative Baseline Rate Model',
        status: VERSION_STATUSES.FROZEN,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-03-31',
        isLocked: true,
        lockedAt: '2026-04-05T14:30:00Z',
        lockRationale: 'Locked post Q1 board financial close review',
        scheduleName: 'ASC Baseline Operating Cost Schedule v2026.1',
        orMinuteRate: 15.00,
        laborBurdenMultiplier: 1.25,
        totalPeriodsFrozen: 1
      },
      {
        id: 'ver-002',
        versionCode: '2026.2_PRODUCTION',
        versionName: 'FY2026 Q2-Q3 Operating Cost Schedule',
        status: VERSION_STATUSES.ACTIVE,
        effectiveFrom: '2026-04-01',
        effectiveTo: null,
        isLocked: false,
        lockedAt: null,
        lockRationale: null,
        scheduleName: 'ASC Operating Cost Schedule v2026.2 (Post-Union Wage Adjustment)',
        orMinuteRate: 16.50,
        laborBurdenMultiplier: 1.28,
        totalPeriodsFrozen: 2
      },
      {
        id: 'ver-003',
        versionCode: '2027.0_CALIBRATION',
        versionName: 'FY2027 Proposed Payer Fee Schedule Model',
        status: VERSION_STATUSES.DRAFT,
        effectiveFrom: '2027-01-01',
        effectiveTo: null,
        isLocked: false,
        lockedAt: null,
        lockRationale: null,
        scheduleName: 'ASC Strategic Contract Schedule 2027 Draft',
        orMinuteRate: 17.50,
        laborBurdenMultiplier: 1.30,
        totalPeriodsFrozen: 0
      },
      {
        id: 'ver-004',
        versionCode: '2025.4_SUPERSEDED',
        versionName: 'FY2025 Q4 Year-End Close Model',
        status: VERSION_STATUSES.SUPERSEDED,
        effectiveFrom: '2025-10-01',
        effectiveTo: '2025-12-31',
        isLocked: true,
        lockedAt: '2026-01-15T18:00:00Z',
        lockRationale: 'Annual GAAP financial audit freeze',
        scheduleName: 'ASC Baseline Cost Schedule 2025.4',
        orMinuteRate: 14.00,
        laborBurdenMultiplier: 1.22,
        totalPeriodsFrozen: 1
      }
    ];

    const periods = [
      {
        id: 'per-001',
        periodName: '2026-Q1',
        periodStartDate: '2026-01-01',
        periodEndDate: '2026-03-31',
        calculationVersionCode: '2026.1_BASELINE',
        freezeStatus: FREEZE_STATUSES.FROZEN,
        totalCasesFrozen: 412,
        totalFrozenRevenue: 1845000.00,
        totalFrozenDirectCosts: 1120000.00,
        totalFrozenContributionMargin: 725000.00,
        frozenAt: '2026-04-05T14:30:00Z',
        unfreezeReason: null
      },
      {
        id: 'per-002',
        periodName: '2026-Q2',
        periodStartDate: '2026-04-01',
        periodEndDate: '2026-06-30',
        calculationVersionCode: '2026.2_PRODUCTION',
        freezeStatus: FREEZE_STATUSES.FROZEN,
        totalCasesFrozen: 438,
        totalFrozenRevenue: 1980000.00,
        totalFrozenDirectCosts: 1195000.00,
        totalFrozenContributionMargin: 785000.00,
        frozenAt: '2026-07-08T16:00:00Z',
        unfreezeReason: null
      },
      {
        id: 'per-003',
        periodName: '2026-10-OCT',
        periodStartDate: '2026-10-01',
        periodEndDate: '2026-10-31',
        calculationVersionCode: '2026.2_PRODUCTION',
        freezeStatus: FREEZE_STATUSES.OPEN,
        totalCasesFrozen: 0,
        totalFrozenRevenue: 0.00,
        totalFrozenDirectCosts: 0.00,
        totalFrozenContributionMargin: 0.00,
        frozenAt: null,
        unfreezeReason: null
      },
      {
        id: 'per-004',
        periodName: '2025-Q4',
        periodStartDate: '2025-10-01',
        periodEndDate: '2025-12-31',
        calculationVersionCode: '2025.4_SUPERSEDED',
        freezeStatus: FREEZE_STATUSES.REOPENED_AUDIT,
        totalCasesFrozen: 395,
        totalFrozenRevenue: 1720000.00,
        totalFrozenDirectCosts: 1045000.00,
        totalFrozenContributionMargin: 675000.00,
        frozenAt: '2026-01-15T18:00:00Z',
        unfreezeReason: 'Reopened for Medicare bad debt cost settlement reconciliation'
      }
    ];

    const auditHistory = [
      {
        id: 'run-001',
        runType: 'PRODUCTION_POST',
        sourceVersion: '2026.2_PRODUCTION',
        targetVersion: '2026.2_PRODUCTION',
        casesEvaluated: 438,
        totalBaselineMargin: 785000.00,
        totalRecalculatedMargin: 785000.00,
        variance: 0.00,
        variancePct: 0.00,
        executedAt: '2026-07-08T16:00:00Z',
        user: 'Sarah Jenkins (CFO)'
      },
      {
        id: 'run-002',
        runType: 'DRY_RUN_SIMULATION',
        sourceVersion: '2026.2_PRODUCTION',
        targetVersion: '2027.0_CALIBRATION',
        casesEvaluated: 7,
        totalBaselineMargin: 10810.00,
        totalRecalculatedMargin: 11425.00,
        variance: 615.00,
        variancePct: 5.69,
        executedAt: '2026-10-28T11:15:00Z',
        user: 'Financial Analytics Lead'
      },
      {
        id: 'run-003',
        runType: 'HISTORICAL_RESTATEMENT',
        sourceVersion: '2025.4_SUPERSEDED',
        targetVersion: '2025.4_SUPERSEDED',
        casesEvaluated: 395,
        totalBaselineMargin: 675000.00,
        totalRecalculatedMargin: 672400.00,
        variance: -2600.00,
        variancePct: -0.39,
        executedAt: '2026-11-01T09:45:00Z',
        user: 'External Audit Lead'
      }
    ];

    const sampleCases = [
      {
        id: 401,
        patient: 'Eleanor Vance',
        procedure: 'Phacoemulsification Cataract Extr w/ IOL',
        cpt_codes: '66984',
        surgeonName: 'Dr. James Thorne, MD',
        specialty: 'Ophthalmology',
        expectedContributionMargin: 1250.00,
        completenessScore: 100.00
      },
      {
        id: 402,
        patient: 'Marcus Brody',
        procedure: 'Knee Arthroscopy & Meniscectomy',
        cpt_codes: '29881',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        expectedContributionMargin: 1680.00,
        completenessScore: 95.00
      },
      {
        id: 403,
        patient: 'Claire Bennet',
        procedure: 'Total Hip Arthroplasty (Anterior)',
        cpt_codes: '27130',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        expectedContributionMargin: 3100.00,
        completenessScore: 69.00
      },
      {
        id: 404,
        patient: 'Gregory House',
        procedure: 'Lumbar Epidural Steroid Injection',
        cpt_codes: '62323',
        surgeonName: 'Dr. Alistair Finch, MD',
        specialty: 'Pain Management',
        expectedContributionMargin: 820.00,
        completenessScore: 100.00
      },
      {
        id: 405,
        patient: 'Thomas Wayne',
        procedure: 'Tympanoplasty w/ Mastoidectomy',
        cpt_codes: '69641',
        surgeonName: 'Dr. Elena Rostova, MD',
        specialty: 'ENT',
        expectedContributionMargin: 1420.00,
        completenessScore: 75.00
      },
      {
        id: 406,
        patient: 'Robert Sterling',
        procedure: 'Laparoscopic Cholecystectomy',
        cpt_codes: '47562',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        expectedContributionMargin: 1820.00,
        completenessScore: 95.00
      },
      {
        id: 407,
        patient: 'Victor Fries',
        procedure: 'Excision Complex Soft Tissue Mass',
        cpt_codes: '27048',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        expectedContributionMargin: -280.00,
        completenessScore: 49.00
      }
    ];

    return { versions, periods, auditHistory, sampleCases };
  }
};
