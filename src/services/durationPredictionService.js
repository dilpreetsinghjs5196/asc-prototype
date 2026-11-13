/**
 * Duration Prediction Models Engine (P50/P75/P80/P90) (Phase A8)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Statistical Percentiles (P50 Median, P75, P80 Balanced Target, P90 Overtime Shield)
 * - Standard Deviation & Coefficient of Variation (CV) Dispersion Metrics
 * - Sample Size Hierarchical Fallback Tiers & Confidence Scoring (HIGH, MODERATE, LOW, INSUFFICIENT)
 * - Clinical Patient Complexity Modifiers (BMI ≥ 35, Prior Revision, Dual Procedure)
 * - Predictive Case Scheduling Recommendations & Error Tracking
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

export const CONFIDENCE_LEVELS = {
  HIGH: {
    code: 'HIGH',
    label: 'High Confidence (N ≥ 20)',
    badgeClass: 'badge-emerald',
    description: 'Surgeon-specific historical dataset with tight variance (CV ≤ 0.25).'
  },
  MODERATE: {
    code: 'MODERATE',
    label: 'Moderate Confidence (10–19)',
    badgeClass: 'badge-blue',
    description: 'Moderate historical sample or slightly higher dispersion.'
  },
  LOW: {
    code: 'LOW',
    label: 'Low Confidence (5–9)',
    badgeClass: 'badge-amber',
    description: 'Limited sample; blended with facility specialty baseline.'
  },
  INSUFFICIENT: {
    code: 'INSUFFICIENT',
    label: 'Insufficient Data (< 5)',
    badgeClass: 'badge-crimson',
    description: 'Sparse data; fallback to standard catalog benchmark.'
  }
};

export const MODEL_TIERS = {
  TIER_1_SURGEON_CPT: {
    code: 'TIER_1_SURGEON_CPT',
    label: 'Tier 1: Surgeon + CPT Specific',
    badgeClass: 'badge-emerald'
  },
  TIER_2_SURGEON_SPECIALTY: {
    code: 'TIER_2_SURGEON_SPECIALTY',
    label: 'Tier 2: Surgeon Specialty Baseline',
    badgeClass: 'badge-blue'
  },
  TIER_3_FACILITY_CPT: {
    code: 'TIER_3_FACILITY_CPT',
    label: 'Tier 3: Facility CPT Consensus',
    badgeClass: 'badge-amber'
  },
  TIER_4_BENCHMARK: {
    code: 'TIER_4_BENCHMARK',
    label: 'Tier 4: Standard Catalog Benchmark',
    badgeClass: 'badge-crimson'
  }
};

export const PERCENTILE_PROFILES = {
  P50: {
    code: 'P50',
    label: 'P50 (Median)',
    badgeClass: 'badge-blue',
    percentile: 50,
    description: 'Aggressive scheduling; 50% probability of completion. Recommended for high-volume rapid turnover morning blocks.'
  },
  P75: {
    code: 'P75',
    label: 'P75 (Quartile)',
    badgeClass: 'badge-blue',
    percentile: 75,
    description: 'Standard baseline duration target.'
  },
  P80: {
    code: 'P80',
    label: 'P80 (Balanced Target)',
    badgeClass: 'badge-emerald',
    percentile: 80,
    description: 'Recommended operational standard; optimal balance between utilization and delay prevention.'
  },
  P90: {
    code: 'P90',
    label: 'P90 (Overtime Shield)',
    badgeClass: 'badge-amber',
    percentile: 90,
    description: 'Conservative target; 90% completion confidence. Prevents staffing window overtime for complex or late cases.'
  }
};

export const COMPLEXITY_MODIFIERS = {
  HIGH_BMI: {
    code: 'HIGH_BMI',
    label: 'High BMI (≥ 35)',
    modifierPct: 0.10,
    description: '+10% buffer for complex patient prep and wound closure'
  },
  REVISION_SURGERY: {
    code: 'REVISION_SURGERY',
    label: 'Prior Scarring / Revision',
    modifierPct: 0.15,
    description: '+15% buffer for extensive adhesiolysis and tissue dissection'
  },
  DUAL_PROCEDURE: {
    code: 'DUAL_PROCEDURE',
    label: 'Dual / Bilateral Procedure',
    modifierPct: 0.30,
    description: '+30% buffer for second operative site or concurrent CPTs'
  }
};

/**
 * Calculates a specific percentile from a sorted array of numbers:
 * Uses linear rank interpolation: Rank R = (P / 100) * (N - 1) + 1
 */
export function calculatePercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }
  const vals = [...sortedValues].sort((a, b) => a - b);
  const n = vals.length;

  if (n === 1) return vals[0];

  const p = Math.max(0, Math.min(100, Number(percentile) || 50));
  const rank = (p / 100) * (n - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  if (lowerIndex === upperIndex) {
    return vals[lowerIndex];
  }

  const result = vals[lowerIndex] + weight * (vals[upperIndex] - vals[lowerIndex]);
  return Math.round(result);
}

/**
 * Calculates descriptive distribution statistics:
 * Mean, Standard Deviation, and Coefficient of Variation (CV = stdDev / mean)
 */
export function calculateDistributionStatistics(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      sampleSize: 0,
      min: 0,
      max: 0,
      mean: 0.00,
      stdDev: 0.00,
      coefficientOfVariation: 0.000
    };
  }

  const sampleSize = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / sampleSize).toFixed(2));

  if (sampleSize === 1) {
    return {
      sampleSize: 1,
      min,
      max,
      mean,
      stdDev: 0.00,
      coefficientOfVariation: 0.000
    };
  }

  const varianceSum = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  const stdDev = Number(Math.sqrt(varianceSum / (sampleSize - 1)).toFixed(2));
  const coefficientOfVariation = mean > 0 ? Number((stdDev / mean).toFixed(3)) : 0.000;

  return {
    sampleSize,
    min,
    max,
    mean,
    stdDev,
    coefficientOfVariation
  };
}

/**
 * Determines model confidence level based on sample size and dispersion:
 * - HIGH: N >= 20 and CV <= 0.25
 * - MODERATE: 10 <= N < 20 (or N >= 20 with CV > 0.25)
 * - LOW: 5 <= N < 10
 * - INSUFFICIENT: N < 5
 */
export function determineConfidenceLevel(sampleSize, coefficientOfVariation = 0.20) {
  const n = Number(sampleSize) || 0;
  const cv = Number(coefficientOfVariation) || 0.20;

  if (n >= 20 && cv <= 0.25) {
    return 'HIGH';
  }
  if (n >= 10) {
    return 'MODERATE';
  }
  if (n >= 5) {
    return 'LOW';
  }
  return 'INSUFFICIENT';
}

/**
 * Predicts surgical case duration with optional complexity adjustments:
 */
export function predictCaseDuration(surgeonName, cptCode, options = {}, models = SEED_DURATION_MODELS) {
  const {
    targetPercentile = 'P80',
    hasHighBmi = false,
    isRevision = false,
    isDualProcedure = false
  } = options;

  const model = models.find(
    m => m.surgeonName.toLowerCase() === (surgeonName || '').toLowerCase() && m.primaryCptCode === cptCode
  ) || models.find(m => m.primaryCptCode === cptCode);

  if (!model) {
    return {
      baseDuration: 60,
      complexityBufferMinutes: 0,
      recommendedDuration: 60,
      targetPercentile: 'P80',
      confidenceLevel: 'INSUFFICIENT',
      modelTier: 'TIER_4_BENCHMARK'
    };
  }

  let baseDuration = model.p80DurationMinutes;
  if (targetPercentile === 'P50') baseDuration = model.p50DurationMinutes;
  else if (targetPercentile === 'P75') baseDuration = model.p75DurationMinutes;
  else if (targetPercentile === 'P90') baseDuration = model.p90DurationMinutes;

  let modifierSumPct = 0;
  if (hasHighBmi) modifierSumPct += COMPLEXITY_MODIFIERS.HIGH_BMI.modifierPct;
  if (isRevision) modifierSumPct += COMPLEXITY_MODIFIERS.REVISION_SURGERY.modifierPct;
  if (isDualProcedure) modifierSumPct += COMPLEXITY_MODIFIERS.DUAL_PROCEDURE.modifierPct;

  // Cap modifier at +50%
  modifierSumPct = Math.min(0.50, modifierSumPct);

  const complexityBufferMinutes = Math.round(baseDuration * modifierSumPct);
  const recommendedDuration = baseDuration + complexityBufferMinutes;

  return {
    baseDuration,
    complexityBufferMinutes,
    recommendedDuration,
    targetPercentile,
    confidenceLevel: model.confidenceLevel,
    modelTier: model.modelTier,
    model
  };
}

/**
 * Calculates prediction error between actual in-room time and recommended booking:
 * Error = Actual - Recommended
 */
export function calculatePredictionError(actualDuration, recommendedDuration) {
  const actual = Number(actualDuration) || 0;
  const rec = Number(recommendedDuration) || 0;
  return actual - rec;
}

/**
 * Calculates facility-wide aggregated KPIs for Duration Prediction:
 */
export function calculateFacilityPredictionKpis(models = [], predictionLogs = []) {
  const modelList = Array.isArray(models) ? models : [];
  const logList = Array.isArray(predictionLogs) ? predictionLogs : [];

  const totalModels = modelList.length;
  const highConfidenceModels = modelList.filter(m => m.confidenceLevel === 'HIGH').length;
  const highConfidenceCoveragePct = totalModels > 0
    ? Number(((highConfidenceModels / totalModels) * 100).toFixed(1))
    : 0.0;

  const totalLogs = logList.length;
  const evaluatedLogs = logList.filter(l => l.actualDurationMinutes != null);

  const totalAbsError = evaluatedLogs.reduce(
    (acc, l) => acc + Math.abs(Number(l.predictionErrorMinutes) || 0),
    0
  );
  const meanAbsoluteErrorMinutes = evaluatedLogs.length > 0
    ? Number((totalAbsError / evaluatedLogs.length).toFixed(1))
    : 0.0;

  const completedWithinTargetCount = evaluatedLogs.filter(
    l => Number(l.actualDurationMinutes) <= Number(l.recommendedDurationMinutes)
  ).length;

  const completedWithinTargetPct = evaluatedLogs.length > 0
    ? Number(((completedWithinTargetCount / evaluatedLogs.length) * 100).toFixed(1))
    : 0.0;

  const overtimeRiskMitigatedCount = logList.filter(
    l => l.selectedPercentile === 'P90' || l.complexityAdjustmentMinutes > 0
  ).length;

  return {
    totalModels,
    highConfidenceModels,
    highConfidenceCoveragePct,
    totalLogs,
    evaluatedLogsCount: evaluatedLogs.length,
    meanAbsoluteErrorMinutes,
    completedWithinTargetCount,
    completedWithinTargetPct,
    overtimeRiskMitigatedCount
  };
}

/**
 * Filters duration prediction models:
 */
export function filterPredictionModels(models = [], filters = {}) {
  const { surgeon, specialty, confidence, searchQuery } = filters;

  return models.filter(m => {
    if (surgeon && surgeon !== 'ALL' && m.surgeonName !== surgeon) {
      return false;
    }
    if (specialty && specialty !== 'ALL' && m.specialtyCode !== specialty) {
      return false;
    }
    if (confidence && confidence !== 'ALL' && m.confidenceLevel !== confidence) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchSurgeon = m.surgeonName && m.surgeonName.toLowerCase().includes(q);
      const matchCpt = m.primaryCptCode && m.primaryCptCode.toLowerCase().includes(q);
      const matchProc = m.procedureName && m.procedureName.toLowerCase().includes(q);
      if (!matchSurgeon && !matchCpt && !matchProc) {
        return false;
      }
    }
    return true;
  });
}

// ==============================================================================
// Clinical Realistic Seed Data for Phase A8 Engine Simulation
// ==============================================================================

export const SEED_DURATION_MODELS = [
  {
    id: 'dpm-001',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Robert Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    sampleSize: 42,
    minDurationMinutes: 62,
    p50DurationMinutes: 78,
    p75DurationMinutes: 84,
    p80DurationMinutes: 85,
    p90DurationMinutes: 94,
    maxDurationMinutes: 110,
    meanDurationMinutes: 80.40,
    stdDevMinutes: 9.80,
    coefficientOfVariation: 0.122,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-10T18:00:00Z',
    schedulingInsight: 'Surgeon historically booked at 60m. P80 model sets 85m (+25m) eliminating chronic overrun.'
  },
  {
    id: 'dpm-002',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Robert Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '29827',
    procedureName: 'Rotator Cuff Repair (Arthroscopic)',
    sampleSize: 26,
    minDurationMinutes: 95,
    p50DurationMinutes: 118,
    p75DurationMinutes: 124,
    p80DurationMinutes: 126,
    p90DurationMinutes: 135,
    maxDurationMinutes: 148,
    meanDurationMinutes: 120.20,
    stdDevMinutes: 12.40,
    coefficientOfVariation: 0.103,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-10T18:00:00Z',
    schedulingInsight: 'P80 recommendation of 126m shields against late-day room overtime.'
  },
  {
    id: 'dpm-003',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (Outpatient)',
    sampleSize: 34,
    minDurationMinutes: 98,
    p50DurationMinutes: 110,
    p75DurationMinutes: 115,
    p80DurationMinutes: 118,
    p90DurationMinutes: 124,
    maxDurationMinutes: 135,
    meanDurationMinutes: 112.50,
    stdDevMinutes: 8.20,
    coefficientOfVariation: 0.073,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-10T18:00:00Z',
    schedulingInsight: 'Exceptionally tight surgical distribution (CV 0.073). Highly predictable.'
  },
  {
    id: 'dpm-004',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Emily Vance, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    primaryCptCode: '66984',
    procedureName: 'Cataract Extracapsular w/ IOL',
    sampleSize: 58,
    minDurationMinutes: 18,
    p50DurationMinutes: 24,
    p75DurationMinutes: 26,
    p80DurationMinutes: 27,
    p90DurationMinutes: 30,
    maxDurationMinutes: 36,
    meanDurationMinutes: 24.80,
    stdDevMinutes: 3.40,
    coefficientOfVariation: 0.137,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-11T19:00:00Z',
    schedulingInsight: 'Surgeon defensive padding of 45m reduced to P80 of 27m (-18m), reclaiming 2.5 hrs/block.'
  },
  {
    id: 'dpm-005',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    primaryCptCode: '47562',
    procedureName: 'Laparoscopic Cholecystectomy',
    sampleSize: 38,
    minDurationMinutes: 58,
    p50DurationMinutes: 70,
    p75DurationMinutes: 75,
    p80DurationMinutes: 78,
    p90DurationMinutes: 84,
    maxDurationMinutes: 98,
    meanDurationMinutes: 71.90,
    stdDevMinutes: 8.60,
    coefficientOfVariation: 0.120,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-11T19:00:00Z',
    schedulingInsight: 'Well-calibrated baseline matching scheduled 75m window.'
  },
  {
    id: 'dpm-006',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Amanda Foster, MD',
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    primaryCptCode: '69436',
    procedureName: 'Tympanostomy w/ Tube Insertion',
    sampleSize: 30,
    minDurationMinutes: 22,
    p50DurationMinutes: 28,
    p75DurationMinutes: 30,
    p80DurationMinutes: 31,
    p90DurationMinutes: 34,
    maxDurationMinutes: 38,
    meanDurationMinutes: 28.60,
    stdDevMinutes: 3.20,
    coefficientOfVariation: 0.112,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-12T17:00:00Z',
    schedulingInsight: 'Pediatric tube insertion stable at 30 minutes.'
  },
  {
    id: 'dpm-007',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Marcus Thorne, MD',
    specialtyCode: 'SPINE_SURGERY',
    primaryCptCode: '63030',
    procedureName: 'Lumbar Laminotomy / Discectomy',
    sampleSize: 22,
    minDurationMinutes: 125,
    p50DurationMinutes: 148,
    p75DurationMinutes: 156,
    p80DurationMinutes: 160,
    p90DurationMinutes: 172,
    maxDurationMinutes: 195,
    meanDurationMinutes: 151.40,
    stdDevMinutes: 16.50,
    coefficientOfVariation: 0.109,
    confidenceLevel: 'HIGH',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-12T17:00:00Z',
    schedulingInsight: 'Scheduled duration of 120m systematically under-books. P80 sets 160m (+40m).'
  },
  {
    id: 'dpm-008',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Marcus Thorne, MD',
    specialtyCode: 'SPINE_SURGERY',
    primaryCptCode: '22612',
    procedureName: 'Posterior Lumbar Arthrodesis',
    sampleSize: 14,
    minDurationMinutes: 175,
    p50DurationMinutes: 215,
    p75DurationMinutes: 228,
    p80DurationMinutes: 232,
    p90DurationMinutes: 245,
    maxDurationMinutes: 260,
    meanDurationMinutes: 218.00,
    stdDevMinutes: 22.80,
    coefficientOfVariation: 0.105,
    confidenceLevel: 'MODERATE',
    modelTier: 'TIER_1_SURGEON_CPT',
    lastTrainedAt: '2026-11-12T17:00:00Z',
    schedulingInsight: 'Moderate sample size (N=14). Recommend P90 (245m) when scheduled as last case.'
  }
];

export const SEED_PREDICTION_LOGS = [
  {
    id: 'pred-001',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8910',
    surgeryDate: '2026-11-10',
    surgeonName: 'Dr. Robert Chen, MD',
    primaryCptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    scheduledDurationMinutes: 60,
    predictedP50Minutes: 78,
    predictedP75Minutes: 84,
    predictedP80Minutes: 85,
    predictedP90Minutes: 94,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 85,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 85,
    predictionErrorMinutes: 0,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-002',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8911',
    surgeryDate: '2026-11-10',
    surgeonName: 'Dr. Robert Chen, MD',
    primaryCptCode: '29827',
    procedureName: 'Rotator Cuff Repair (Arthroscopic)',
    scheduledDurationMinutes: 90,
    predictedP50Minutes: 118,
    predictedP75Minutes: 124,
    predictedP80Minutes: 126,
    predictedP90Minutes: 135,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 126,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 125,
    predictionErrorMinutes: -1,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-003',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8912',
    surgeryDate: '2026-11-10',
    surgeonName: 'Dr. Sarah Jenkins, MD',
    primaryCptCode: '47562',
    procedureName: 'Laparoscopic Cholecystectomy',
    scheduledDurationMinutes: 75,
    predictedP50Minutes: 70,
    predictedP75Minutes: 75,
    predictedP80Minutes: 78,
    predictedP90Minutes: 84,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 78,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 72,
    predictionErrorMinutes: -6,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-004',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8914',
    surgeryDate: '2026-11-11',
    surgeonName: 'Dr. Emily Vance, MD',
    primaryCptCode: '66984',
    procedureName: 'Cataract Extracapsular w/ IOL',
    scheduledDurationMinutes: 45,
    predictedP50Minutes: 24,
    predictedP75Minutes: 26,
    predictedP80Minutes: 27,
    predictedP90Minutes: 30,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 27,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 24,
    predictionErrorMinutes: -3,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-005',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8916',
    surgeryDate: '2026-11-11',
    surgeonName: 'Dr. Marcus Thorne, MD',
    primaryCptCode: '63030',
    procedureName: 'Lumbar Laminotomy / Discectomy',
    scheduledDurationMinutes: 120,
    predictedP50Minutes: 148,
    predictedP75Minutes: 156,
    predictedP80Minutes: 160,
    predictedP90Minutes: 172,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 160,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 155,
    predictionErrorMinutes: -5,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-006',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8917',
    surgeryDate: '2026-11-11',
    surgeonName: 'Dr. Marcus Thorne, MD',
    primaryCptCode: '22612',
    procedureName: 'Posterior Lumbar Arthrodesis',
    scheduledDurationMinutes: 180,
    predictedP50Minutes: 215,
    predictedP75Minutes: 228,
    predictedP80Minutes: 232,
    predictedP90Minutes: 245,
    selectedPercentile: 'P90',
    recommendedDurationMinutes: 245,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 220,
    predictionErrorMinutes: -25,
    confidenceLevel: 'MODERATE'
  },
  {
    id: 'pred-007',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8918',
    surgeryDate: '2026-11-12',
    surgeonName: 'Dr. Kevin Zhao, MD',
    primaryCptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (Outpatient)',
    scheduledDurationMinutes: 110,
    predictedP50Minutes: 110,
    predictedP75Minutes: 115,
    predictedP80Minutes: 118,
    predictedP90Minutes: 124,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 118,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 114,
    predictionErrorMinutes: -4,
    confidenceLevel: 'HIGH'
  },
  {
    id: 'pred-008',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8920',
    surgeryDate: '2026-11-12',
    surgeonName: 'Dr. Amanda Foster, MD',
    primaryCptCode: '69436',
    procedureName: 'Tympanostomy w/ Tube Insertion',
    scheduledDurationMinutes: 30,
    predictedP50Minutes: 28,
    predictedP75Minutes: 30,
    predictedP80Minutes: 31,
    predictedP90Minutes: 34,
    selectedPercentile: 'P80',
    recommendedDurationMinutes: 31,
    complexityAdjustmentMinutes: 0,
    actualDurationMinutes: 28,
    predictionErrorMinutes: -3,
    confidenceLevel: 'HIGH'
  }
];
