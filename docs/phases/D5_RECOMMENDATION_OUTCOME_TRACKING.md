# D5 RECOMMENDATION OUTCOME TRACKING

## Purpose
The Recommendation Outcome Tracking & Attribution Engine provides authoritative measurement, causal attribution, and uplift analytics for all executed financial recommendations. It quantifies the real-world financial, operational, and clinical yield produced by the Decision Intelligence platform, establishes counterfactual baselines to prove net incremental value, attributes credit between autonomous machine logic and human clinical/billing intervention, and provides closed-loop calibration feedback to optimize future prioritization models.

## Scope
- Measure realized financial outcomes against counterfactual baselines (what would have occurred under standard baseline billing sweeps).
- Determine multi-touch causal attribution across machine detection (D0), priority ranking (D1), evidentiary packaging (D2), and human signoff/negotiation (D3).
- Calculate deterministic performance metrics: Incremental Financial Uplift ($\Delta = \text{Gross Realized} - \text{Counterfactual Baseline}$), Uplift Percentage, Cycle Time Reduction (Days Saved in AR), and Model Calibration Ratio ($\text{Realized} / \text{Expected}$).
- Maintain multi-tenancy isolation (`facility_id UUID`) and enforce role-based access control (RBAC).
- Feed back attribution weights and calibration outcomes into recommendation prioritization scoring to dynamically fine-tune confidence parameters.

## Current State
Prior to Phase D5, the system could generate recommendations (D0), score priority (D1), link evidence citations (D2), collect human signoffs (D3), and record historical realized revenue in the Decision Ledger (D4). However, the system lacked a rigorous framework to determine *causal attribution* (whether dollars recovered were directly caused by the machine, human intervention, or organic billing sweeps), quantify net uplift against counterfactual baselines, or evaluate model calibration accuracy.

| Component | Status | Description |
| :--- | :--- | :--- |
| `public.next_best_financial_actions` | **KEEP** | Core financial recommendations established in Phase D0. |
| `public.recommendation_scoring_profiles` | **KEEP** | Mathematical priority scoring profiles established in Phase D1. |
| `public.recommendation_evidence_items` | **KEEP** | Multi-source clinical and contractual citations established in Phase D2. |
| `public.recommendation_approvals` | **KEEP** | Human authorization and dual-key signoffs established in Phase D3. |
| `public.decision_ledger_entries` | **KEEP** | Historical block-chained decision entries established in Phase D4. |
| Gross realization without causal attribution | **REPLACE** | Replace raw recovery totals with counterfactual uplift and multi-touch attribution modeling. |
| `public.recommendation_outcomes` | **MISSING** | Production table tracking causal attribution, counterfactual baselines, incremental uplift, and calibration ratios. |
| `public.recommendation_attribution_touchpoints` | **MISSING** | Granular event ledger recording individual algorithmic and human touchpoints contributing to each recovery. |
| Counterfactual Baseline Engine | **MISSING** | Deterministic baseline recovery estimation using historical ASC payment and timely filing data. |
| Outcome Tracking & Attribution UI | **MISSING** | Maestro Clinical interface displaying attribution breakdowns, uplift analytics, and touchpoint audit timelines. |

## Target State
In the target state, every realized recommendation is evaluated through an authoritative outcome measurement and attribution pipeline:
1. **Attribution Modeling Framework:**
   - `DIRECT_MACHINE_ATTRIBUTED`: Automated or rule-triggered action (e.g., automated secondary claim generation, prompt-pay demand) where machine detection was the sole driver ($\ge 85\%$ machine credit).
   - `COLLABORATIVE_ATTRIBUTED`: Shared contribution between algorithm detection/evidence assembly and human negotiation/appeals defense (e.g., complex CARC 16 appeal, OR block reallocation).
   - `HUMAN_EXECUTIVE_ATTRIBUTED`: Executive-driven override or contract exception where human intervention drove the majority of recovery ($\ge 70\%$ human credit).
   - `ORGANIC_BASELINE_ATTRIBUTED`: Cases where standard automated payer adjudication would have resolved the balance organically without intervention.
2. **Counterfactual Baseline Estimation:**
   - Every recommendation category maintains an auditable counterfactual recovery probability (e.g., standard recovery rate for unappealed CARC 16 denials is 12.0%; unmonitored OR block releases fill at 15.0%).
   - Net Incremental Uplift is deterministically computed: $\text{Uplift} = \text{Gross Realized} - (\text{Expected Value} \times \text{Baseline Recovery Rate})$.
3. **Model Calibration & Velocity Metrics:**
   - Model Calibration Ratio: $\text{Calibration} = \text{Gross Realized} / \text{Expected Value}$. A ratio near $1.000$ demonstrates high predictive fidelity; ratios $< 0.85$ flag systematic over-optimism.
   - Cycle Time Velocity: Days saved between intervention adjudication date and standard ASC aging benchmarks (e.g., average 45-day AR reduced to 8.4 days).
4. **Closed-Loop Feedback:**
   - Outcomes feed back into Phase D1 scoring profiles to reward high-performing action categories with increased confidence weights.

## Data Model / Schema

### 1. `public.recommendation_outcomes`
```sql
CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    ledger_entry_id UUID REFERENCES public.decision_ledger_entries(id) ON DELETE SET NULL,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    attribution_model VARCHAR(32) NOT NULL CHECK (attribution_model IN (
        'DIRECT_MACHINE_ATTRIBUTED',
        'COLLABORATIVE_ATTRIBUTED',
        'HUMAN_EXECUTIVE_ATTRIBUTED',
        'ORGANIC_BASELINE_ATTRIBUTED'
    )),
    machine_attribution_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (machine_attribution_pct >= 0 AND machine_attribution_pct <= 100),
    human_attribution_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (human_attribution_pct >= 0 AND human_attribution_pct <= 100),
    expected_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gross_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    baseline_counterfactual_recovery NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    incremental_uplift_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    incremental_uplift_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    days_saved_cycle_time NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    model_calibration_ratio NUMERIC(5, 3) NOT NULL DEFAULT 1.000,
    outcome_confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
    attribution_rationale TEXT NOT NULL,
    verified_by_user_id VARCHAR(64) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_outcome_action UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_outcomes_facility ON public.recommendation_outcomes(facility_id, attribution_model);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_action ON public.recommendation_outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_category ON public.recommendation_outcomes(category);
```

### 2. `public.recommendation_attribution_touchpoints`
```sql
CREATE TABLE IF NOT EXISTS public.recommendation_attribution_touchpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id UUID NOT NULL REFERENCES public.recommendation_outcomes(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    touchpoint_stage VARCHAR(32) NOT NULL CHECK (touchpoint_stage IN (
        'DETECTION_NBFA',
        'PRIORITY_RANKING',
        'EVIDENCE_ASSEMBLY',
        'HUMAN_APPROVAL',
        'DISPATCH_EXECUTION',
        'REMITTANCE_ADJUDICATION'
    )),
    actor_entity VARCHAR(64) NOT NULL,
    contribution_weight_pct NUMERIC(5, 2) NOT NULL CHECK (contribution_weight_pct >= 0 AND contribution_weight_pct <= 100),
    touchpoint_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    touchpoint_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_outcome ON public.recommendation_attribution_touchpoints(outcome_id);
CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_facility ON public.recommendation_attribution_touchpoints(facility_id);
```

### 3. `public.vw_recommendation_outcome_telemetry`
```sql
CREATE OR REPLACE VIEW public.vw_recommendation_outcome_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_tracked_outcomes_count,
    COALESCE(SUM(gross_realized_value), 0.00) AS total_gross_realized_value,
    COALESCE(SUM(baseline_counterfactual_recovery), 0.00) AS total_counterfactual_baseline_value,
    COALESCE(SUM(incremental_uplift_value), 0.00) AS total_incremental_uplift_value,
    CASE 
        WHEN COALESCE(SUM(baseline_counterfactual_recovery), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(incremental_uplift_value), 0.00) / SUM(baseline_counterfactual_recovery)) * 100.0, 1)
        ELSE 100.0
    END AS cumulative_uplift_rate_pct,
    COALESCE(ROUND(AVG(machine_attribution_pct), 1), 0.0) AS avg_machine_attribution_pct,
    COALESCE(ROUND(AVG(human_attribution_pct), 1), 0.0) AS avg_human_attribution_pct,
    COALESCE(ROUND(AVG(days_saved_cycle_time), 1), 0.0) AS avg_days_saved_cycle_time,
    COALESCE(ROUND(AVG(model_calibration_ratio), 3), 1.000) AS avg_model_calibration_ratio,
    COUNT(id) FILTER (WHERE attribution_model = 'DIRECT_MACHINE_ATTRIBUTED') AS direct_machine_count,
    COUNT(id) FILTER (WHERE attribution_model = 'COLLABORATIVE_ATTRIBUTED') AS collaborative_count,
    COUNT(id) FILTER (WHERE attribution_model = 'HUMAN_EXECUTIVE_ATTRIBUTED') AS human_executive_count,
    MAX(updated_at) AS latest_outcome_measured_at
FROM public.recommendation_outcomes
GROUP BY facility_id;
```

## Business Rules

### 1. Counterfactual Baseline & Uplift Formulas
- **Counterfactual Baseline Recovery:** Standard empirical probability that the dollars would have been collected without algorithmic intervention:
  $$\text{Counterfactual Baseline} = \text{Expected Value} \times \text{Baseline Recovery Factor}$$
- **Incremental Uplift Value:** True net value created by the Decision Intelligence platform:
  $$\text{Incremental Uplift} = \text{Gross Realized Value} - \text{Counterfactual Baseline}$$
- **Incremental Uplift Percentage:**
  $$\text{Uplift \%} = \begin{cases}
  0.0\% & \text{if Counterfactual Baseline} = 0 \\
  \text{Round}\left(\left(\frac{\text{Incremental Uplift}}{\text{Counterfactual Baseline}}\right) \times 100, 1\right) & \text{if Counterfactual Baseline} > 0
  \end{cases}$$

### 2. Multi-Touch Attribution Mathematical Invariant
For every recommendation outcome, the machine and human attribution percentages must sum strictly to 100.00%:
$$\text{machine\_attribution\_pct} + \text{human\_attribution\_pct} = 100.00\%$$
Violations trigger a hard validation error (`Attribution weights must sum exactly to 100.00%`).

### 3. Model Calibration Ratio
$$\text{Model Calibration Ratio} = \begin{cases}
1.000 & \text{if Expected Value} = 0 \\
\text{Round}\left(\frac{\text{Gross Realized Value}}{\text{Expected Value}}, 3\right) & \text{if Expected Value} > 0
\end{cases}$$
- Calibration $> 1.000$: Under-projected actual financial value (conservative scoring).
- Calibration $= 1.000$: Exact prediction fidelity.
- Calibration $< 0.850$: Over-projected recovery (triggers automated penalty in future prioritization).

### 4. Prohibited Behaviors
- **No Double-Counting Realized Value:** Realized amounts cannot be attributed to multiple conflicting action items.
- **No Unjustified 100% Attribution:** Collaborative actions that required dual-key signoff (Tier 2/3) must reflect at least 20% human attribution.

## Permissions / Security
- **Tenancy Boundary:** Strictly enforced by `facility_id UUID`.
- **Role Permissions:**
  - `cfo`, `admin`, `super_admin`: Full access to view outcomes, adjust attribution models, export ROI dossiers, and recalibrate baseline weights.
  - `financial_controller`, `billing_specialist`: Access to view attribution breakdowns, submit post-adjudication outcome measurements.
  - `clinical_director`: Access to view OR block recovery attribution and clinical documentation cycle time savings.
  - `viewer`: Read-only aggregate telemetry viewing.

## API / Service Requirements

### Backend Services (`recommendationOutcomeService.js`)
- `getRecommendationOutcomes(facilityId, filters)`: Retrieves outcomes filtered by attribution model, category, or search term.
- `getOutcomeById(id)`: Retrieves single outcome entry with linked touchpoints and counterfactual breakdown.
- `getOutcomeForAction(actionId)`: Retrieves outcome associated with an NBFA action.
- `recordOutcomeAttribution(actionId, outcomeData, userContext)`: Computes uplift, validates 100% attribution sum, assigns touchpoints, and persists record.
- `getAttributionTouchpoints(outcomeId)`: Returns sequential touchpoints for an outcome.
- `getOutcomeTelemetry(facilityId)`: Computes aggregate facility ROI, cumulative uplift, and calibration fidelity.
- `calculateIncrementalUplift(grossRealized, counterfactualBaseline)`: Helper method for deterministic uplift.
- `calculateModelCalibrationRatio(grossRealized, expectedValue)`: Helper method for calibration ratio.

## UI / Workflow Requirements
- **Outcome Tracking & Attribution Workbench:**
  - **Telemetry Ribbon (5 Cards):**
    1. *Cumulative Incremental Uplift:* Net financial yield gained over standard baseline (\$26,840.00).
    2. *Avg Machine Attribution:* Platform algorithmic contribution rate (e.g. 68.5% Machine).
    3. *AR Days Saved:* Average cycle time reduction across adjudicated claims (18.4 Days).
    4. *Model Calibration Index:* Predictive accuracy score (1.024x).
    5. *Tracked Outcomes:* Completed recommendation volume (7 of 7 tracked).
  - **Filter Toolbar:** Attribution Model filter (`ALL`, `Direct Machine`, `Collaborative`, `Human Executive`), Category filter, Search query.
  - **Outcome Master Table:**
    - Action Code & Category (e.g., `NBFA-2026-0801` - Urgent CARC 16 Appeal).
    - Attribution Pill: Machine vs Human split badge (e.g. `70% Machine / 30% Human`).
    - Financial Accounting: Gross Realized, Counterfactual Baseline, and Net Incremental Uplift badge (Emerald `+$2,680.00`).
    - Efficiency Gains: Days Saved in AR (e.g. `14.2d`) and Calibration Ratio (e.g. `1.000x`).
    - Actions: "Inspect Touchpoints" button opening the causal attribution drawer.
  - **Interactive Drawer / Modal:**
    - *Attribution Touchpoint Timeline:* Chronological visualization of contributing actors (NBFA Engine, ROPS Scorer, Evidence Assembler, Billing Approver, CFO Signer).
    - *Counterfactual Baseline Analysis:* Visual explanation of the historical control recovery rate and net uplift methodology.

## Audit / Provenance
Every outcome record retains:
- `touchpoint_hash`: SHA-256 cryptographic digest of each touchpoint payload, contributing actor, and timestamp.
- Full provenance linking back to Decision Ledger block (D4), approval requests (D3), evidence items (D2), and source claims (D0).

## QA / Test Cases
1. **Telemetry & Uplift KPI Aggregation:** Verify accurate calculation of total realized, counterfactual baseline, net incremental uplift, and average calibration ratio.
2. **Facility UUID Alias Resolution:** Confirm `'00000000-0000-0000-0000-000000000002'` resolves interchangeably with `'fac-naples-01'`.
3. **Deterministic Incremental Uplift:** Verify mathematical calculation of uplift dollars and percentage across exact, surplus, and partial cases.
4. **Attribution Weight Sum Invariant:** Verify that `machine_attribution_pct + human_attribution_pct === 100.00%`.
5. **Model Calibration Ratio:** Verify exact calculation of `realized / expected` without floating-point drift.
6. **Counterfactual Baseline Calculation:** Confirm category baseline factors calculate expected organic recovery accurately.
7. **Multi-Touch Touchpoint Retrieval:** Verify that each outcome retrieves sequential contributing actors and weights.
8. **Outcome Attribution Recording:** Verify creating/updating an outcome recalculates telemetry and appends touchpoints.
9. **PostgreSQL Migration 112:** Verify UP and DOWN migration idempotency, UUID foreign keys, constraints, and RLS policies.
10. **Zero-Purple Maestro Clinical Token Compliance:** Verify zero prohibited purple tokens across all CSS and JSX files.
11. **Dual Re-export Facade Parity:** Verify `src/lib/recommendationOutcomeService.js` re-exports all methods and constants from `src/services/recommendationOutcomeService.js`.
12. **App Shell Navigation Wiring:** Verify integration in `src/App.jsx` including sidebar menu item, headers, date filter exclusion, and tab render.

## Acceptance Criteria
- Build passes (`npm run build`).
- Full test suite passes without regressions (`npm test`).
- No mock/placeholder values presented as production truth.
- Tenant isolation strictly verified.
- Causal attribution and counterfactual uplift mathematically validated.

## Dependencies
- Upstream: Phase D0 (`next_best_financial_actions`), Phase D1 (`recommendation_scoring_profiles`), Phase D2 (`recommendation_evidence_items`), Phase D3 (`recommendation_approvals`), Phase D4 (`decision_ledger_entries`).
- PostgreSQL: `pgcrypto` extension for `gen_random_uuid()`.

## Definition of Done
A feature is complete only when the schema migration, authoritative outcome service, attribution engine, outcome tracking UI, and automated test suite are fully operational and verified.

## Implementation Notes
- Migration `112_recommendation_outcomes.sql` deploys `recommendation_outcomes`, `recommendation_attribution_touchpoints`, and `vw_recommendation_outcome_telemetry` with RLS.
- Migration `112_recommendation_outcomes_down.sql` provides clean rollback capability.
- Client service `recommendationOutcomeService.js` and facade `src/lib/recommendationOutcomeService.js` authored with comprehensive seed outcomes and multi-touch touchpoints.
- UI component `RecommendationOutcomeTrackingView.jsx` and styling `RecommendationOutcomeTrackingView.css` authored following Maestro Clinical design system.
