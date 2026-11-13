# A8 DURATION PREDICTION MODELS (P50/P75/P80/P90)

## Purpose
P50/P75/P80/P90 duration models, sample size, and confidence. This specification defines production standards for surgical case duration prediction using statistical percentile distributions, sample size validation, hierarchical fallback tiers, clinical complexity risk adjustments, and confidence scoring to eliminate scheduling optimism bias and defensive padding.

## Scope
- Define production requirements for predictive surgical duration modeling across all procedures and surgeons.
- Preserve compatibility with the current ASCANALYST product, historical case logs, and booking accuracy data.
- Use deterministic, auditable mathematical rules for percentiles (P50, P75, P80, P90), standard deviations, and coefficients of variation.
- Enforce organization/facility tenancy and role-based access control (RBAC).

## Current State
- **Phase A0 (Operating Room Master Model):** Provides physical room configurations and specialty equipment dependencies.
- **Phase A1 (Room Staffing Windows):** Establishes room shifts and net available capacity denominators.
- **Phase A2 (Block Schedule Model):** Defines recurring block times that need accurate duration packing.
- **Phase A4 (OR Utilization Metrics):** Tracks gross staffed and prime-time room occupancy.
- **Phase A6 (Booking Accuracy):** Tracks Mean Duration Bias (MDB) and historical 20-case median actuals.
- **Phase A7 (Turnover Metrics):** Measures non-operative room turnaround times.
- **Duration Prediction Gap:** Currently, case scheduling relies on static surgeon estimation or fixed duration templates. Without multi-percentile modeling (P50 vs P80 vs P90), schedulers cannot choose between aggressive room packing and conservative overtime protection. Hierarchical sample-size fallback and complexity modifiers are unmodeled.
- Classification:
  - Historical Case Log Times (`actual_in_room_minutes`): **KEEP**.
  - Mean Duration Bias (`or_surgeon_booking_profiles`): **KEEP**.
  - Multi-Percentile Duration Prediction Engine: **MISSING** (Implemented in Phase A8).

## Target State
1. **Multi-Percentile Distribution Models:**
   - **P50 (Median):** 50% likelihood case finishes within time. Recommended for high-volume rapid turnover procedures (e.g. Cataract, Arthroscopy) during prime morning hours.
   - **P75 (Upper Quartile):** Standard baseline expectation.
   - **P80 (Balanced Target):** Recommended operational target for standard scheduling; strikes optimal trade-off between room utilization and delay risk.
   - **P90 (Conservative / Overtime Shield):** 90% completion confidence. Recommended for complex patients, end-of-day cases, or surgeons with high variance to prevent nursing overtime.
2. **Sample Size & Hierarchical Fallback Tiers:**
   - **Tier 1 (Surgeon + CPT):** $N \ge 20 \to$ `HIGH_CONFIDENCE`. Highest accuracy; personalized surgeon technique curve.
   - **Tier 2 (Surgeon + Specialty):** $10 \le N < 20 \to$ `MODERATE_CONFIDENCE`. Blended specialty baseline.
   - **Tier 3 (Facility CPT Median):** $5 \le N < 10 \to$ `LOW_CONFIDENCE`. Facility peer group aggregate.
   - **Tier 4 (Standard Catalog Benchmark):** $N < 5 \to$ `INSUFFICIENT_DATA`. Standard external benchmark baseline.
3. **Statistical Dispersion & Predictability:**
   - Standard Deviation ($\sigma$) and Coefficient of Variation ($CV = \frac{\sigma}{\mu}$) to flag erratic surgical duration spread.
4. **Clinical Complexity Modifiers:**
   - Patient BMI $\ge 35$ (+10% duration buffer).
   - Prior Surgical Revision / Scarring (+15% duration buffer).
   - Multiple Bilateral / Concurrent CPTs (+30% duration buffer).
5. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: High Confidence Coverage %, Mean Prediction Error (mins), P80 Alignment %, High-Volume CPTs Calibrated, Overtime Risk Cases Mitigated.
   - 3-Tab View: CPT Duration Prediction Models, Case Intake Duration Calculator, Historical Prediction Accuracy Ledger.
   - Interactive Duration Model Review & Calibration Modal.

## Data Model / Schema

### 1. `or_case_duration_prediction_models`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` UUID
- `surgeon_name` VARCHAR(255) NOT NULL
- `specialty_code` VARCHAR(64) NOT NULL
- `primary_cpt_code` VARCHAR(16) NOT NULL
- `procedure_name` VARCHAR(255) NOT NULL
- `sample_size` INTEGER NOT NULL DEFAULT 0
- `min_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `p50_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `p75_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `p80_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `p90_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `max_duration_minutes` INTEGER NOT NULL DEFAULT 0
- `mean_duration_minutes` NUMERIC(6, 2) NOT NULL DEFAULT 0.00
- `std_dev_minutes` NUMERIC(6, 2) NOT NULL DEFAULT 0.00
- `coefficient_of_variation` NUMERIC(5, 3) NOT NULL DEFAULT 0.000
- `confidence_level` VARCHAR(32) NOT NULL DEFAULT `'INSUFFICIENT'` -- 'HIGH', 'MODERATE', 'LOW', 'INSUFFICIENT'
- `model_tier` VARCHAR(32) NOT NULL DEFAULT `'TIER_1_SURGEON_CPT'` -- 'TIER_1_SURGEON_CPT', 'TIER_2_SURGEON_SPECIALTY', 'TIER_3_FACILITY_CPT', 'TIER_4_BENCHMARK'
- `last_trained_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_or_duration_prediction_model` UNIQUE (`facility_id`, `surgeon_name`, `primary_cpt_code`)

### 2. `or_case_duration_predictions_log`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `case_id` VARCHAR(64) NOT NULL
- `surgery_date` DATE NOT NULL
- `surgeon_name` VARCHAR(255) NOT NULL
- `primary_cpt_code` VARCHAR(16) NOT NULL
- `procedure_name` VARCHAR(255) NOT NULL
- `scheduled_duration_minutes` INTEGER NOT NULL
- `predicted_p50_minutes` INTEGER NOT NULL
- `predicted_p75_minutes` INTEGER NOT NULL
- `predicted_p80_minutes` INTEGER NOT NULL
- `predicted_p90_minutes` INTEGER NOT NULL
- `selected_percentile` VARCHAR(16) NOT NULL DEFAULT `'P80'`
- `recommended_duration_minutes` INTEGER NOT NULL
- `complexity_adjustment_minutes` INTEGER NOT NULL DEFAULT 0
- `actual_duration_minutes` INTEGER
- `prediction_error_minutes` INTEGER -- (actual - recommended)
- `confidence_level` VARCHAR(32) NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. Indexes & Views
- Indexes on `(facility_id, surgeon_name, primary_cpt_code)`, `(facility_id, confidence_level)`, `(facility_id, primary_cpt_code)`.
- Analytical View `vw_or_duration_prediction_accuracy`: Summarizes prediction error, Mean Absolute Percentage Error (MAPE), and percentage of cases completing within predicted P80 window.
- Analytical View `vw_or_duration_models_by_cpt`: Cross-surgeon benchmark comparison of P50, P80, and P90 percentiles per CPT code.

## Business Rules

### Rule 1: Deterministic Percentile Calculation
For a sorted set of historical actual durations $X = [x_1, x_2, \dots, x_N]$ where $x_1 \le x_2 \le \dots \le x_N$:
$$\text{Rank } R = \frac{P}{100} \times (N - 1) + 1$$
$$\text{Percentile } P = x_{\lfloor R \rfloor} + (R - \lfloor R \rfloor) \times (x_{\lceil R \rceil} - x_{\lfloor R \rfloor})$$
- Calculated for $P \in \{50, 75, 80, 90\}$.
- If $N = 1$, all percentiles equal $x_1$.

### Rule 2: Confidence Level & Fallback Hierarchy
1. **`HIGH` Confidence:** $N \ge 20$ AND $CV \le 0.25$. Tier 1 (Surgeon + CPT). Recommended without manual override.
2. **`MODERATE` Confidence:** $10 \le N < 20$ OR ($N \ge 20$ with $CV > 0.25$). Tier 1 or Tier 2. Displays advisory notice.
3. **`LOW` Confidence:** $5 \le N < 10$. Tier 3 (Facility CPT Median). Requires scheduler confirmation.
4. **`INSUFFICIENT` Data:** $N < 5$. Tier 4 (Standard Catalog Benchmark). Schedulers must review surgeon historical notes.

### Rule 3: Clinical Complexity Modifiers
$$\text{Adjusted Duration} = \text{Base Percentile Duration} \times (1 + \sum \text{Modifier Pct})$$
- **High BMI ($\ge 35$):** $+10\%$ (increases prep, positioning, and wound closure time).
- **Prior Surgical Revision / Scar Tissue:** $+15\%$ (increases dissection and adhesiolysis duration).
- **Dual / Bilateral Procedure:** $+30\%$ (second surgical site or simultaneous bilateral intervention).
- Cumulative modifier cannot exceed $+50\%$ total baseline buffer.

### Rule 4: Percentile Selection Governance
- Morning Prime-Time High-Volume Block: Schedulers may select **P50** if consecutive identical cases follow.
- Standard Routine Booking: Default to **P80**.
- Last Case of Day / Overtime Risk: Default to **P90** to prevent staffing window breach.

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `clinical_director`: Full View, Retrain Models, Adjust Benchmark Tiers, Export Accuracy Audits.
  - `scheduler`, `nurse_manager`: View Predictions, Use Case Intake Calculator, Select Percentile Targets.
  - `surgeon_user`: Restricted View of own CPT prediction models, percentile curves, and anonymized peer benchmarks.

## API / Service Requirements
- `calculatePercentile(sortedValues, percentile)`
- `calculateDistributionStatistics(values = [])`
- `determineConfidenceLevel(sampleSize, coefficientOfVariation)`
- `predictCaseDuration(surgeonName, cptCode, options = {})`
- `calculatePredictionError(actualDuration, recommendedDuration)`
- `calculateFacilityPredictionKpis(models, predictionLogs)`
- `filterPredictionModels(models, filters)`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:**
  1. High Confidence Model Coverage % ($N \ge 20$).
  2. Mean Absolute Prediction Error (MAPE / mins).
  3. Cases Completed Within P80 Target %.
  4. Calibrated CPT Models Count.
  5. Prevented Overtime Incidents Count.
- **3-Tab View Switcher:**
  - Tab 1: **CPT Duration Prediction Models** (Surgeon, CPT, Sample Size $N$, P50/P75/P80/P90, CV, Confidence Pill, Tier, Model Details).
  - Tab 2: **Case Intake Duration Calculator** (Interactive sandbox: Surgeon, CPT, Patient Risk Factors $\to$ Dynamic P50/P80/P90 Curve & Recommended Booking Duration).
  - Tab 3: **Historical Prediction Accuracy Ledger** (Case ID, Scheduled, Predicted P80, Actual In-Room, Error $\Delta$, Within Target Flag).
- **Interactive Model Calibration Modal:** Pinned header and footer with flex column scrolling body.
- **Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High contrast clinical blue, emerald, amber, slate, and crimson.

## Audit / Provenance
- Duration models record `last_trained_at`, `sample_size`, and version timestamp.
- Prediction logs capture the selected percentile (`P50`, `P75`, `P80`, `P90`), applied complexity modifiers, user ID, and actual post-operative variance.

## QA / Test Cases
1. **Percentile Math:** Test exact P50, P75, P80, P90 on known test arrays (odd, even, single element).
2. **Statistical Metrics:** Test Mean, Standard Deviation, and CV calculations.
3. **Confidence Level Assignment:** Test all 4 tiers based on sample size and dispersion boundaries.
4. **Complexity Adjustments:** Verify additive risk buffers (BMI, Revision, Dual procedure).
5. **Database Migration 085:** Verify forward UP and rollback DOWN scripts and multi-tenant RLS.
6. **Design System & Zero Purple Compliance:** Strict audit of all tokens in JSX and CSS.
7. **App.jsx Integration:** Verify component mounting and navigation.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/duration-prediction.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql` - Physical suites)
  - Phase A1 (`078_room_staffing_windows.sql` - Shift boundaries)
  - Phase A2 (`079_block_schedule_model.sql` - Block schedules)
  - Phase A6 (`083_booking_accuracy.sql` - Case durations and actuals)
  - Phase A7 (`084_turnover_metrics.sql` - Turnover intervals)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `085_duration_prediction.sql` and `085_duration_prediction_down.sql`.
- Service: `src/services/durationPredictionService.js` and `src/lib/durationPredictionService.js`.
- UI: `src/components/DurationPredictionView.jsx` and `src/components/DurationPredictionView.css`.
- Tests: `tests/duration-prediction.test.js`.
- App Wiring: `src/App.jsx`.

