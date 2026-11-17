# B0 SURGEON INTELLIGENCE FRAMEWORK

## Purpose
Surgeon operational, clinical, and financial intelligence framework for Ambulatory Surgery Centers (ASCs). This specification establishes enterprise engineering standards for aggregating multi-dimensional surgical telemetry, calculating deterministic surgeon efficiency benchmarks, identifying volume churn and cost outliers, and generating actionable retention and block optimization interventions.

## Scope
- Define production requirements for the Surgeon Intelligence Subsystem within Module 11 (Surgeon & Clinical Intelligence).
- Preserve full backward compatibility with the Surgeon Model (Phase 35), Historical Block Schedule (Phase A2), Turnover Metrics (Phase A7), P80 Duration Benchmarks (Phase A8), Recoverable Capacity (Phase A9), Next Best Case (Phase AA), and CP-SAT Schedule Optimizer (Phase AB).
- Establish auditable, server-authoritative mathematical formulas for 5-Pillar Surgeon Performance Scoring ($S_{\text{composite}}$) and Tier Classification.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Provide role-gated visibility ensuring attending surgeons can view their personal scorecards while leadership maintains peer comparison and facility-wide benchmarking.

## Current State
- **Phase 35 (Surgeon Model):** Establishes `public.surgeons` with 19 attending surgeons, storing basic demographics (`id BIGINT`, `firstname`, `lastname`, `specialty`, `license_number`, `facility_id UUID`).
- **Phase 58 (Surgeon Preference Cards):** Stores procedural supply configurations and item staging preferences.
- **Phase 75 (Contribution Margin per OR-Hour):** Calculates facility-wide contribution margin per staffed OR-hour ($/OR-hr).
- **Phase A2 & A5 (Block Schedule & Utilization):** Tracks surgeon block allocations, released blocks, and utilization rates.
- **Phase A7 (Turnover Metrics):** Tracks same-surgeon (25m benchmark) vs different-surgeon (40m benchmark) turnover durations.
- **Phase A8 (Duration Prediction):** Provides calibrated P50, P75, P80 procedure duration baselines.
- **Intelligence Gap:** Currently, `src/services/aiOperations/SurgeonIntelligence.js` consists of a 42-line prototype helper limited to string deduplication and basic CPT array scanning. Facility leadership lacks an automated, objective system to evaluate surgeon contribution, monitor volume churn risks, detect chronic start delays, identify supply cost outliers, or optimize block allocations based on data.
- **Classification:**
  - Base Surgeon Identity (`public.surgeons`): **KEEP**.
  - Preference Cards & Block Schedules (`surgeon_preference_cards`, `or_block_schedule`): **KEEP**.
  - Legacy Prototype Helper (`src/services/aiOperations/SurgeonIntelligence.js`): **REFACTOR** / **REPLACE**.
  - Master Surgeon Intelligence Engine: **MISSING** (Implemented in Phase B0).

## Target State
1. **Deterministic 5-Pillar Performance Scoring ($S_{\text{composite}} \in [0, 100]$):**
   - **Pillar 1: Financial Margin & Economic Yield ($S_{\text{financial}}$, Weight 30%):** Evaluates Contribution Margin per OR-Hour ($/OR-hr), Net Collections per Case, and Commercial Payer Ratio.
   - **Pillar 2: OR Operational Efficiency & Punctuality ($S_{\text{operational}}$, Weight 25%):** Measures First-Case On-Time Start Rate (FC-OTSR %), Incision Duration Variance Ratio against P80 ($D_{\text{act}} / D_{\text{P80}}$), and Turnover Delay Minutes against standards.
   - **Pillar 3: Block Utilization & Schedule Reliability ($S_{\text{block}}$, Weight 20%):** Evaluates Allocated vs Utilized Block Hours, Auto-Release Compliance, and Surrender Lead-Time.
   - **Pillar 4: Clinical Quality & Schedule Integrity ($S_{\text{quality}}$, Weight 15%):** Tracks Late Cancellation Rate (< 24h notice), Same-Day Reschedule Rate, and Pre-Op Clinical Documentation Completeness.
   - **Pillar 5: Supply Chain & Waste Discipline ($S_{\text{supply}}$, Weight 10%):** Measures Supply/Implant Cost Variance vs Specialty Peer Median, Unused Sterile Waste Rate, and Preference Card Audit Frequency.
2. **Surgeon Performance Tier Classification:**
   - **`TIER_1_PINNACLE` ($90.00 \le S \le 100.00$):** High-margin, highly punctual, optimal block utilization. Priority recipient of expanded block time and capital equipment allocations.
   - **`TIER_2_CORE_PERFORMER` ($75.00 \le S < 90.00$):** Consistent, dependable surgical volume with standard operational metrics.
   - **`TIER_3_OPPORTUNITY` ($60.00 \le S < 75.00$):** Demonstrates high clinical quality but exhibits specific operational bottlenecks (e.g., late starts, high supply costs, or sluggish turnover).
   - **`TIER_4_AT_RISK` ($S < 60.00$):** Low margin, frequent late cancellations, chronic tardiness, or block underutilization. Target for leadership intervention or block reallocation.
3. **Automated Anomaly Detection & Strategic Alerting:**
   - `VOLUME_CHURN_RISK`: Alerts when rolling 60-day surgical case volume drops by $\ge 20\%$ against prior baseline, signaling potential case migration to competing facilities.
   - `CHRONIC_START_DELAY`: Alerts when first-case start delays exceed 15 minutes on $\ge 30\%$ of scheduled operative days.
   - `SUPPLY_COST_OUTLIER`: Flags surgeons whose average implant/supply cost exceeds the specialty 75th percentile benchmark by $\ge \$500/\text{case}$.
   - `BLOCK_UNDERUTILIZATION`: Triggers block clawback review when rolling 90-day block utilization falls below $70\%$.
4. **Interactive Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Active Surgeons Monitored, Facility Avg Composite Score, Top Performer Margin Yield ($/OR-hr), At-Risk Volume Churn Count, Facility First-Case On-Time Start Rate (%).
   - Interactive Filters: Specialty Filter, Performance Tier Pill Filter, Evaluation Time Horizon (30d, 90d, 180d, 365d, YTD).
   - 3-Tab Operational Interface:
     1. Surgeon Intelligence Master Grid & Tiering
     2. 5-Pillar Radar & Specialty Benchmark Matrix
     3. Anomaly Alerts, Retention Interventions & Block Recommendations
   - Pinned Action Modal: Comprehensive Surgeon Profile & Strategic Action Plan.

## Data Model / Schema

### 1. `surgeon_intelligence_profiles`
Master ledger of computed rolling surgeon intelligence scores and operational benchmarks:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `evaluation_period_start` DATE NOT NULL
- `evaluation_period_end` DATE NOT NULL
- `composite_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `performance_tier` VARCHAR(32) NOT NULL DEFAULT 'CORE_PERFORMER' -- 'PINNACLE', 'CORE_PERFORMER', 'OPPORTUNITY', 'AT_RISK'
- `financial_yield_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `or_efficiency_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `block_utilization_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `clinical_quality_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `supply_discipline_score` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `total_cases_performed` INTEGER NOT NULL DEFAULT 0
- `total_or_minutes` INTEGER NOT NULL DEFAULT 0
- `net_collections` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_contribution_margin` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `margin_per_or_hour` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `first_case_ontime_start_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `avg_turnover_minutes` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `block_utilization_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `late_cancellation_rate` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `supply_cost_variance_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_surgeon_eval_period` UNIQUE (`facility_id`, `surgeon_id`, `evaluation_period_start`, `evaluation_period_end`)

### 2. `surgeon_intelligence_alerts`
Operational and financial anomaly alerts generated by the intelligence engine:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `alert_type` VARCHAR(64) NOT NULL -- 'VOLUME_CHURN_RISK', 'CHRONIC_START_DELAY', 'SUPPLY_COST_OUTLIER', 'BLOCK_UNDERUTILIZATION', 'EXCESSIVE_TURNOVER'
- `severity` VARCHAR(16) NOT NULL DEFAULT 'WARNING' -- 'INFO', 'WARNING', 'CRITICAL'
- `metric_name` VARCHAR(64) NOT NULL
- `observed_value` NUMERIC(10, 2) NOT NULL
- `benchmark_threshold` NUMERIC(10, 2) NOT NULL
- `variance_pct` NUMERIC(6, 2) NOT NULL
- `alert_message` TEXT NOT NULL
- `recommended_action` TEXT NOT NULL
- `resolution_status` VARCHAR(32) NOT NULL DEFAULT 'OPEN' -- 'OPEN', 'IN_REVIEW', 'ACTION_TAKEN', 'DISMISSED'
- `resolved_by_user_id` UUID
- `resolved_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. `surgeon_intelligence_benchmarks`
Configurable facility and specialty-level performance targets:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `specialty_code` VARCHAR(64) NOT NULL
- `benchmark_year` INTEGER NOT NULL DEFAULT 2026
- `target_margin_per_hour` NUMERIC(10, 2) NOT NULL DEFAULT 1500.00
- `target_ontime_start_pct` NUMERIC(5, 2) NOT NULL DEFAULT 85.00
- `target_turnover_same_surgeon` INTEGER NOT NULL DEFAULT 25
- `target_turnover_diff_surgeon` INTEGER NOT NULL DEFAULT 40
- `target_block_utilization_pct` NUMERIC(5, 2) NOT NULL DEFAULT 75.00
- `max_acceptable_cancel_rate` NUMERIC(5, 2) NOT NULL DEFAULT 5.00
- `max_supply_variance_pct` NUMERIC(5, 2) NOT NULL DEFAULT 10.00
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_facility_specialty_benchmark` UNIQUE (`facility_id`, `specialty_code`, `benchmark_year`)

### 4. Analytical Views
- `vw_surgeon_intelligence_summary`: Joins `surgeon_intelligence_profiles` with `public.surgeons` to provide real-time dashboard data.
- `vw_surgeon_intelligence_active_alerts`: Filters open critical and warning alerts with surgeon demographic metadata.

## Business Rules

### Rule 1: Multi-Pillar Scoring Formulation
The Composite Intelligence Score ($S_{\text{composite}} \in [0, 100]$) is computed using exact deterministic weights:
$$S_{\text{composite}} = w_F \cdot S_{\text{financial}} + w_O \cdot S_{\text{operational}} + w_B \cdot S_{\text{block}} + w_Q \cdot S_{\text{quality}} + w_S \cdot S_{\text{supply}}$$
Where:
- $w_F = 0.30$ (Financial Margin & Economic Yield)
- $w_O = 0.25$ (OR Operational Efficiency & Punctuality)
- $w_B = 0.20$ (Block Utilization & Reliability)
- $w_Q = 0.15$ (Clinical Quality & Schedule Integrity)
- $w_S = 0.10$ (Supply Chain & Waste Discipline)
$$\sum w_i = 1.00$$

1. **Financial Yield Pillar ($S_{\text{financial}} \in [0, 100]$):**
   - Margin per OR-Hour component: $\min\left(60, \frac{\text{Margin/OR-Hr}}{\$1,800.00} \times 60\right)$
   - Collection Realization component: $\min\left(25, \frac{\text{Net Collections}}{\text{Billed Charges}} \times 25\right)$
   - Commercial Payer Mix component: $\min\left(15, \text{Commercial Ratio} \times 20\right)$
2. **Operational Efficiency Pillar ($S_{\text{operational}} \in [0, 100]$):**
   - First-Case On-Time Start Rate: $\text{FC-OTSR \%} \times 40\text{ pts}$ (Target $\ge 85\%$)
   - Incision Duration Accuracy vs P80 Benchmark: If $|D_{\text{act}} - D_{\text{P80}}| \le 10\text{m} \implies 35\text{ pts}$; penalize 2 pts per minute of excess delay.
   - Turnover Efficiency: $25\text{ pts}$ if average same-surgeon turnover $\le 25\text{m}$; penalize 1 pt per minute above benchmark.
3. **Block Utilization Pillar ($S_{\text{block}} \in [0, 100]$):**
   - Block Utilization Rate: $\min\left(60, \frac{\text{Utilized Hours}}{\text{Allocated Hours}} \times 75\right)$ (Target $\ge 75\% = 60\text{ pts}$)
   - Release Notice Compliance: $\ge 72\text{h}$ advance surrender $\implies 25\text{ pts}$; $< 48\text{h} \implies 10\text{ pts}$; no-show $\implies 0\text{ pts}$.
   - Out-of-Block Add-On Utilization: $+15\text{ pts}$.
4. **Clinical Quality Pillar ($S_{\text{quality}} \in [0, 100]$):**
   - Low Late-Cancellation Rate: $50\text{ pts}$ if cancel rate $\le 3\%$; $0\text{ pts}$ if $\ge 15\%$.
   - Pre-Op Documentation Completeness: H&P and consents ready 24h prior $\implies 30\text{ pts}$.
   - Zero Transfer/Complication Rate: $+20\text{ pts}$.
5. **Supply Discipline Pillar ($S_{\text{supply}} \in [0, 100]$):**
   - Supply Cost vs Peer Median: $50\text{ pts}$ if within $\pm 5\%$; penalize 2 pts per % excess.
   - Waste Rate (opened unused items): $30\text{ pts}$ if waste $< 2\%$; $0\text{ pts}$ if $> 8\%$.
   - Preference Card Review Currency: $+20\text{ pts}$ if card updated within 180 days.

### Rule 2: Minimum Volume Probationary Gate
To ensure statistical validity, a surgeon must have performed $\ge 5$ completed surgical cases within the evaluation window. Surgeons with $< 5$ cases are assigned status `PROBATIONARY_LOW_VOLUME` and excluded from facility peer rank distributions to prevent small-sample skewing.

### Rule 3: Anomaly Trigger Thresholds
- **Volume Churn:** $\frac{\text{Cases}_{t} - \text{Cases}_{t-1}}{\text{Cases}_{t-1}} \le -0.20 \implies \text{CRITICAL ALERT}$.
- **Chronic Start Delay:** $\text{FC-OTSR} < 60\% \land \text{Cases} \ge 8 \implies \text{WARNING ALERT}$.
- **Supply Outlier:** $\text{Avg Supply Cost} > 1.25 \times \text{Specialty Median} \implies \text{WARNING ALERT}$.
- **Block Underutilization:** $\text{Block Utilization} < 70\% \text{ for 90 days} \implies \text{CRITICAL CLAWBACK ALERT}$.

## Permissions / Security
- `intelligence.view_surgeon_overview`: View high-level aggregate scorecards, distributions, and tier summaries.
- `intelligence.view_surgeon_financials`: View margin per case, collections, and payer mix breakdowns (Restricted to C-Suite, Executive Director, CFO).
- `intelligence.view_own_scorecard`: Attending surgeons authenticated via Supabase GoTrue can view their own score and blind percentile rank (cannot view other named surgeons).
- `intelligence.manage_alerts`: Acknowledge, resolve, or dismiss operational alerts.
- `intelligence.manage_benchmarks`: Configure specialty target thresholds.
- Multi-tenancy: Strictly isolated via PostgreSQL Row Level Security (`facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`).

## API / Service Requirements
- `GET /api/v1/intelligence/surgeons`: Retrieve surgeon intelligence profiles with filtering by tier, specialty, and period.
- `GET /api/v1/intelligence/surgeons/:id`: Retrieve detailed 5-pillar metrics, historical trend, and procedural mix for a specific surgeon.
- `GET /api/v1/intelligence/surgeons/alerts`: List active operational anomalies and alerts.
- `POST /api/v1/intelligence/surgeons/alerts/:id/resolve`: Resolve an anomaly alert with intervention notes.
- `POST /api/v1/intelligence/surgeons/calculate`: Server-side batch trigger to recalculate profiles across all active surgeons for a facility.

## UI / Workflow Requirements
- **Maestro Clinical Design System:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. Palette restricted to Medical Blue (`#0284c7`), Slate (`#0f172a`, `#64748b`), Emerald (`#059669`), Amber (`#d97706`), and Crimson (`#dc2626`).
- **5-Card Operational Ribbon:** Active Surgeons, Center Avg Score, Top Performer Margin ($/hr), Volume Churn Risk Count, First-Case On-Time Start Rate (%).
- **Interactive Multi-Tier Filter:** All, Pinnacle (90+), Core (75-89), Opportunity (60-74), At-Risk (<60).
- **3 Tab Views:**
  1. Surgeon Intelligence Master Grid & Tiering
  2. 5-Pillar Radar & Specialty Benchmark Matrix
  3. Strategic Anomaly Alerts & Retention Interventions
- **Pinned Flex Column Modals:** Pinned header and footer, scrollable modal body (`overflow-y: auto`), never expanding off-screen.

## Audit / Provenance
Every intelligence computation run records:
- Execution timestamp, facility ID, calculating user/system process.
- Model formula version (`v1.0.0-deterministic`).
- Input surgical case count and total evaluated OR hours.
- Alert status transitions (`OPEN` $\to$ `IN_REVIEW` $\to$ `ACTION_TAKEN` $\to$ `RESOLVED`) with authorizer ID and explanatory notes.

## QA / Test Cases
- Unit tests verifying the 5-pillar mathematical scoring engine, boundary conditions, and weights.
- Unit tests validating tier classification thresholds (`PINNACLE`, `CORE_PERFORMER`, `OPPORTUNITY`, `AT_RISK`).
- Unit tests validating volume churn and start delay anomaly detection algorithms.
- Unit tests verifying the minimum volume probationary gate (< 5 cases).
- Database migration UP and DOWN tests ensuring PostgreSQL syntax validity, RLS enforcement, and `surgeon_id BIGINT` foreign key integrity.
- Maestro design system compliance test verifying ZERO prohibited color tokens in JSX and CSS.
- Application routing verification in `src/App.jsx`.

## Acceptance Criteria
- Build passes (`npm run build` with 0 errors).
- All automated tests pass with 100% success.
- Clean idempotent database migration and rollback SQL (`089_surgeon_intelligence.sql`).
- Attending surgeons cannot inspect other named surgeons' financial yields.
- Working tree clean and committed to git branch `feature/phase-80-claims-model`.

## Dependencies
- Phase 35: Surgeon Model (`public.surgeons`)
- Phase 75: Contribution Margin per OR-Hour
- Phase A2 & A5: Block Scheduling & Block Utilization
- Phase A7: Turnover Metrics
- Phase A8: Duration Prediction

## Definition of Done
A feature is complete only when the authoritative data model, deterministic service layer, automated anomaly detection, security RLS policies, clinical UI views, zero-purple design compliance, automated test suites, and documentation are fully delivered and verified.

## Implementation Notes
- **Specification Files Authored:**
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_11_Intelligence\B0_SURGEON_INTELLIGENCE.md`
  - `docs/phases/B0_SURGEON_INTELLIGENCE.md`
- **Database Migrations:**
  - `supabase/migrations/089_surgeon_intelligence.sql`
  - `supabase/migrations/089_surgeon_intelligence_down.sql`
- **Service Layer:**
  - `src/services/surgeonIntelligenceService.js`
  - `src/lib/surgeonIntelligenceService.js`
- **Clinical UI & Scoped CSS:**
  - `src/components/SurgeonIntelligenceView.jsx`
  - `src/components/SurgeonIntelligenceView.css`
- **Application Wiring:**
  - `src/App.jsx`
- **Test Automation:**
  - `tests/surgeon-intelligence.test.js`
