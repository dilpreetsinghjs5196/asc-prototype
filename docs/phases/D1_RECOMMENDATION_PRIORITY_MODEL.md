# D1 RECOMMENDATION PRIORITY MODEL

## Purpose
The Recommendation Priority Model provides a deterministic, multi-parameter mathematical ranking engine that evaluates candidate financial and operational actions across Ambulatory Surgery Centers (ASCs). It standardizes the calculation of Expected Financial Value, Confidence, Urgency, Recoverability, and Staff Effort into an auditable composite score, ensuring clinical and business office teams focus on maximum ROI and time-critical opportunities.

## Scope
- Define production requirements for the recommendation prioritization mathematics and facility weight profiles (Module 13: Decision Intelligence).
- Establish standardized mathematical transformations for Expected Financial Value ($V$), Confidence ($C$), Urgency ($U$), Recoverability ($R$), and Operational Effort ($E$).
- Provide configurable facility-level scoring profiles (e.g. Balanced Standard, Cash Acceleration, Minimal Staff Effort) with strict mathematical constraints ($\sum W = 1.000$).
- Generate audit-grade calculation traces and cryptographic SHA-256 provenance hashes for every scored action.
- Enforce facility tenancy and multi-tenant Row-Level Security (RLS) linked to `public.facilities(id)`.
- Support role-aware parameter overrides by authorized financial administrators.

## Current State
Prior to Phase D1:
- `nextBestActionService.js` (Phase D0): Introduced baseline hardcoded scoring formula:
  $$\text{Score} = (V_{\text{norm}} \times 0.35) + (U \times 0.25) + (R \times 0.20) + (C \times 0.10) + ((100 - E) \times 0.10)$$
  - **Classification:** **KEEP** as foundational scoring logic; **REFACTOR** to support dynamic facility scoring profiles and detailed calculation tracing.
- Facility Scoring Profile Configuration:
  - **Classification:** **MISSING**. Facilities cannot adjust weights for seasonal cash crunches, staffing shortages, or fiscal year-end recovery surges.
- Calculation Trace & Audit Provenance Ledger:
  - **Classification:** **MISSING**. Actions record only a final composite score without persisting individual normalized components, mathematical trace steps, or formula version hashes.
- Mathematical Sensitivity & What-If Tuning Workspace:
  - **Classification:** **MISSING**. Leadership lacks an interactive workbench to preview how weight changes affect queue prioritization across the facility.

## Target State
Phase D1 delivers an enterprise mathematical priority model:
1. **Mathematical Component Normalization:**
   - **Normalized Financial Value ($S_V \in [0, 100]$):**
     $$S_V = \min\left(100, \frac{V}{V_{\text{cap}}} \times 100\right)$$
     Standard reference ceiling $V_{\text{cap}} = \$25,000.00$. Prevents single outlier claims from completely distorting operational queues.
   - **Urgency Decay Score ($S_U \in [0, 100]$):**
     Dynamic curve based on hours until deadline ($T_{\text{hours}}$):
     $$S_U = \begin{cases} 
     100.0 & \text{if } T_{\text{hours}} \le 24 \\
     90.0 + \left(\frac{72 - T_{\text{hours}}}{48} \times 10.0\right) & \text{if } 24 < T_{\text{hours}} \le 72 \\
     50.0 + \left(\frac{168 - T_{\text{hours}}}{96} \times 40.0\right) & \text{if } 72 < T_{\text{hours}} \le 168 \\
     \max\left(10.0, 50.0 \times \frac{168}{T_{\text{hours}}}\right) & \text{if } T_{\text{hours}} > 168
     \end{cases}$$
   - **Payer Recoverability Score ($S_R \in [0, 100]$):**
     Deterministic probability derived from historical CARC appeal resolution rates and payer fee schedule compliance.
   - **Data Confidence Score ($S_C \in [0, 100]$):**
     Evidence completeness score based on presence of EDI 835 remittance data, signed operative notes, and validated invoice SKU mappings.
   - **Operational Effort Factor ($S_E \in [0, 100]$):**
     Inverse staff burden penalty:
     $$S_{\text{EffortFactor}} = 100 - E$$
     Low staff effort (e.g. 1-click electronic resubmission) scores 85-95; high staff burden (e.g. medical records retrieval + peer-to-peer phone conference) scores 20-40.
2. **Configurable Facility Scoring Profiles (`recommendation_scoring_profiles`):**
   - **Balanced Standard (Default):** Value 35%, Urgency 25%, Recoverability 20%, Confidence 10%, Effort 10%.
   - **Cash Acceleration Mode:** Value 45%, Urgency 30%, Recoverability 15%, Confidence 5%, Effort 5%. (Accelerates immediate liquidity before fiscal close).
   - **Minimal Staff Effort Mode:** Value 25%, Effort 30%, Urgency 20%, Recoverability 15%, Confidence 10%. (Optimizes workqueue throughput during RCM staffing constraints).
   - **Constraint:** $\sum W_i = 1.000$; Value weight $\ge 0.200$; Urgency weight $\ge 0.150$.
3. **Calculation Trace & Provenance Ledger (`recommendation_score_logs`):**
   - Persists step-by-step intermediate variables, active profile ID, formula version, and SHA-256 calculation digest for reproducible audit verification.

## Data Model / Schema
PostgreSQL Migration `108_recommendation_priority_model.sql`:

1. `public.recommendation_scoring_profiles`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `profile_code VARCHAR(32) NOT NULL`
   - `name VARCHAR(128) NOT NULL`
   - `description TEXT NOT NULL`
   - `value_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.350 CHECK (value_weight >= 0.200 AND value_weight <= 0.600)`
   - `urgency_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.250 CHECK (urgency_weight >= 0.150 AND urgency_weight <= 0.500)`
   - `recoverability_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.200 CHECK (recoverability_weight >= 0.050 AND recoverability_weight <= 0.400)`
   - `confidence_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.100 CHECK (confidence_weight >= 0.050 AND confidence_weight <= 0.300)`
   - `effort_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.100 CHECK (effort_weight >= 0.050 AND effort_weight <= 0.400)`
   - `value_cap NUMERIC(12, 2) NOT NULL DEFAULT 25000.00`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT chk_profile_weights_sum CHECK (ROUND(value_weight + urgency_weight + recoverability_weight + confidence_weight + effort_weight, 3) = 1.000)`
   - `CONSTRAINT uq_facility_profile_code UNIQUE(facility_id, profile_code)`

2. `public.recommendation_score_logs`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `profile_id UUID NOT NULL REFERENCES public.recommendation_scoring_profiles(id) ON DELETE CASCADE`
   - `raw_financial_value NUMERIC(12, 2) NOT NULL`
   - `normalized_value_score NUMERIC(5, 2) NOT NULL`
   - `urgency_score NUMERIC(5, 2) NOT NULL`
   - `recoverability_score NUMERIC(5, 2) NOT NULL`
   - `confidence_score NUMERIC(5, 2) NOT NULL`
   - `effort_score NUMERIC(5, 2) NOT NULL`
   - `composite_priority_score NUMERIC(5, 2) NOT NULL`
   - `priority_tier VARCHAR(16) NOT NULL CHECK (priority_tier IN ('P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_ROUTINE'))`
   - `calculation_trace JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `formula_version VARCHAR(32) NOT NULL DEFAULT 'v1.4'`
   - `calculation_hash VARCHAR(64) NOT NULL`
   - `calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

3. `public.vw_recommendation_scoring_telemetry` (View):
   - Aggregates profile in use, average composite priority across facility actions, P0/P1 volume distribution, and calculation log count.

## Business Rules
1. **Zero Generative Arithmetic:**
   - All priority components must be computed server-side via deterministic arithmetic; LLMs are strictly forbidden from fabricating priority scores or adjusting weight ratios.
2. **Weight Sum Invariant:**
   - The sum of weights in any active profile must strictly equal $1.000$. Any mutation violating this constraint is rejected by PostgreSQL check constraints.
3. **Value Saturation Ceiling:**
   - Financial value must normalize against `value_cap` (\$25,000 standard). Amounts exceeding the cap achieve max score (100.0) without overflowing the 35% component weight.
4. **Urgency Hard-Floor:**
   - Any action with $< 24$ hours to irreversible timely filing or auto-release cutoff receives an Urgency score of 100.0, automatically elevating composite rank.
5. **Trace Immutability:**
   - Calculation score logs are append-only. Once computed, the calculation trace, intermediate variables, and SHA-256 hash cannot be edited.

## Permissions / Security
- `priority_model:view`: View scoring profiles, calculation traces, and weight configurations. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `financial_controller`, `billing_specialist`).
- `priority_model:configure`: Create, update, or switch active facility scoring profiles. (Roles: `super_admin`, `org_admin`, `financial_controller`).
- `priority_model:recalculate`: Trigger facility-wide action queue recalculation. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `financial_controller`).

## API / Service Requirements
- `getScoringProfiles(facilityId)`: Query available facility scoring profiles.
- `getActiveScoringProfile(facilityId)`: Retrieve currently active profile.
- `setActiveScoringProfile(facilityId, profileId, userContext)`: Switch active profile and trigger queue re-ranking.
- `calculatePriorityScoreWithTrace(actionData, profile)`: Deterministic mathematical scoring returning step-by-step trace and SHA-256 digest.
- `recalculateFacilityActionQueue(facilityId, profileId)`: Batch recalculation of active queue actions.
- `getScoreLogs(actionId)`: Retrieve historical score computation logs.

## UI / Workflow Requirements
- **Executive Scoring Telemetry Ribbon:** Active Profile Badge, Average Queue Priority Score, Critical P0 Volume, Realization Efficiency, and Formula Integrity Status.
- **Scoring Profile Selector & Manager:** View predefined profiles (Balanced, Cash Acceleration, Minimal Staff Effort) and inspect weight allocations.
- **Interactive Weight Sensitivity Simulator:** Adjust weight sliders with real-time validation of $\sum W = 1.000$ and live queue re-ranking preview.
- **Formula Inspector & Trace Drawer:** Displays raw parameters, normalized scores, component breakdowns, formula string, and cryptographic verification hash.
- **Maestro Clinical Styling:** Full light and dark theme contrast, strictly zero prohibited purple/violet tokens.

## Audit / Provenance
- Every score evaluation produces an immutable record in `public.recommendation_score_logs`.
- Record captures exact input numbers, normalized values, applied profile ID, formula version, and cryptographic SHA-256 calculation hash.
- Profile modifications logged to `public.audit_logs`.

## QA / Test Cases
1. Scoring profiles retrieve accurately with weight validation checks ($\sum W = 1.000$).
2. Normalized value capping functions correctly at $V_{\text{cap}} = \$25,000.00$.
3. Urgency decay curve accurately computes scores across $\le 24$h, $72$h, $168$h, and $> 168$h.
4. Switching active profile updates action composite scores and re-ranks queue.
5. Calculation trace generator produces complete intermediate steps and valid SHA-256 hash.
6. Multi-tenant RLS isolation strictly segregates facility profiles and score logs.
7. Database Migration 108 UP and DOWN SQL integrity verification.
8. Zero-purple Maestro Clinical design token compliance across JSX and CSS.
9. App shell integration and navigation wiring verification.

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All unit, integration, and regression tests pass (`npm test`).
- Zero mock or placeholder values presented as authoritative truth.
- Multi-tenant facility isolation verified via RLS.
- Zero-purple Maestro Clinical design token compliance verified.

## Dependencies
- Upstream: Phase D0 (`D0_NEXT_BEST_FINANCIAL_ACTION`), Phase 71 (`case_financial_ledger`), Phase 85 (`denials_model`).
- Downstream: Phase D2 (`D2_RECOMMENDATION_EVIDENCE`), Phase D4 (`D4_DECISION_LEDGER`).

## Definition of Done
Phase D1 is complete when the specification, PostgreSQL migration 108 (UP & DOWN), service layer, React UI components, CSS styles, App shell wiring, and automated test suite are implemented, passing all tests with zero regressions.

## Implementation Notes
- **Specification:** `docs/phases/D1_RECOMMENDATION_PRIORITY_MODEL.md` and `Phase_13_Decision_Intelligence/D1_RECOMMENDATION_PRIORITY_MODEL.md`.
- **Database:** `supabase/migrations/108_recommendation_priority_model.sql` and `108_recommendation_priority_model_down.sql`.
- **Service:** `src/services/recommendationPriorityService.js` and `src/lib/recommendationPriorityService.js`.
- **UI:** `src/components/RecommendationPriorityModelView.jsx` and `src/components/RecommendationPriorityModelView.css`.
- **Tests:** `tests/recommendation-priority-model.test.js`.
