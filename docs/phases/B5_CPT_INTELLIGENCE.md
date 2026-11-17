# B5 CPT INTELLIGENCE

## Purpose
CPT operational, financial, payer, surgeon, duration, and denial intelligence. This specification defines production standards for multi-dimensional procedural analytics across ambulatory surgical center (ASC) procedural catalogs. It establishes deterministic mathematical models for procedural contribution margins, OR-hour financial yield, cross-surgeon operative duration and supply cost variance, commercial-to-Medicare fee parity spreads, and pre-bill documentation/denial friction.

## Scope
- Define production requirements for the CPT Intelligence Subsystem within Module 11 (Surgeon & Clinical Intelligence / Executive Intelligence).
- Preserve full backward compatibility with CPT Master & Code Year Normalization (Phase 17), CPT Specialty & Body Part Mapping (Phase 19), CPT Coding Assistant & Modifiers (Phases 20-22), CPT-to-Implant Matrix (Phase 27), P80 Operative Duration Predictions (Phase A8), Case Financial Ledger (Phase 91), and Surgeon Financial Scorecard (Phase B1).
- Establish auditable, server-authoritative calculations for CPT contribution margins, margin per OR-hour, Medicare ASC base rate conversion percentages, cross-surgeon operative duration deviations, and procedural denial friction indices.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Implement role-based access control (RBAC): Medical Directors, Surgery Center Administrators, CFOs, Clinical Nurse Managers, and Revenue Cycle Specialists can analyze procedural viability and optimize operational efficiency.

## Current State
- **Phase 17 (CPT Master & Code Normalization):** Maintains standardized CPT catalog (`public.cpt_codes`) with AMA code descriptors, category tags, and effective calendar years.
- **Phase 19 (CPT Specialty & Body Part Mapping):** Groups CPT codes by surgical specialty (Orthopedics, Ophthalmology, Gastroenterology, ENT, General Surgery) and anatomic taxonomy.
- **Phase 20-22 (Coding Assistant & Modifiers):** Manages laterality modifiers (RT, LT, 50), multi-procedure reductions (51, 59), and licensing rules.
- **Phase 27 (CPT-to-Implant Matrix):** Maps procedural codes to required implant hardware and clinical component rules.
- **Phase A8 (P80 Duration Prediction):** Calibrates duration models for case scheduling.
- **Phase B1 (Surgeon Financial Scorecard):** Aggregates surgeon-level revenue, direct costs, and contribution margins.
- **CPT Intelligence Gap:** While CPT codes are referenced across billing and scheduling tables, ASC leadership lacks a unified, procedure-centric intelligence dashboard. Surgical centers cannot easily answer:
  1. Which CPT codes generate the highest cash flow per OR-minute vs which codes tie up suites with low financial return?
  2. How much does operative duration and supply cost vary between different surgeons performing the exact same CPT?
  3. What is the commercial reimbursement spread for a given CPT across payers relative to the regional Medicare ASC fee schedule?
  4. Which CPT codes suffer from chronic first-pass claim denials (e.g. medical necessity, unbundling, pre-authorization lapses)?
- **Classification:**
  - CPT Master Catalog (`cpt_codes`): **KEEP**.
  - Specialty & Anatomic Hierarchy (`cpt_specialties`): **KEEP**.
  - Basic Prototype Filter (`CPTIntelligence.js` in `aiOperations`): **REFACTOR / REPLACE** into unified enterprise service.
  - Dedicated Multi-Dimensional CPT Intelligence Subsystem: **MISSING** (Implemented in Phase B5).

## Target State
1. **Multi-Dimensional Procedural Profiling:**
   - Every evaluated CPT code is profiled across 5 core operational and financial dimensions: Volume/Utilization, Financial Yield, Payer Spread, Cross-Surgeon Technique Variance, and Denial Friction.
2. **Procedural Financial Yield & OR-Hour Velocity:**
   - **Case Contribution Margin ($CM_{\text{cpt}}$):** Total net collections less direct variable costs (implants, specialized surgical supplies, time-driven OR nursing labor, and medications):
     $$CM_{\text{cpt}} = R_{\text{net}} - C_{\text{direct}}$$
   - **Margin Per OR-Hour ($Yield_{\text{OR\_hour}}$):** The ultimate measure of surgical suite productivity:
     $$Yield_{\text{OR\_hour}} = \left(\frac{CM_{\text{cpt}}}{T_{\text{OR\_minutes}}}\right) \times 60$$
3. **Cross-Surgeon Technique & Efficiency Variance:**
   - For any given CPT code, track the performance distribution across credentialed surgeons:
     - Mean and P80 operative duration (skin-to-skin) by surgeon.
     - Supply and implant acquisition cost by surgeon for the same procedure.
     - Identification of clinical best practices to standardize preference cards and reduce suite holding time.
4. **Payer Reimbursement Spread & Medicare Parity:**
   - Compare actual allowable reimbursement across commercial health plans against the statutory regional Medicare ASC base rate:
     $$\text{Medicare Parity } \% = \left(\frac{A_{\text{actual}}}{R_{\text{medicare\_base}}}\right) \times 100$$
   - Highlight payers reimbursing below Medicare or below contracted fee schedule exhibits.
5. **Denial & Billing Friction Intelligence:**
   - First-pass denial rate per CPT code ($DR_{\text{cpt}}$).
   - Root-cause denial categorization (e.g., CARC 50 Medical Necessity, CARC 197 Prior Authorization, CARC 97 Unbundling).
   - Unbilled documentation lag (operative report completion delay) impacting cash flow.
   - Procedural Friction Index ($FI_{\text{cpt}}$):
     $$FI_{\text{cpt}} = (0.50 \times DR_{\text{cpt}}) + (0.30 \times \text{Norm}(\text{DaysToPay})) + (0.20 \times \text{Norm}(\text{DocLagDays}))$$
6. **CPT Performance Stratification Tiers:**
   - `TIER_1_ANCHOR_PROFIT`: High contribution per OR-hour ($\ge \$2,000/\text{hr}$) and low friction ($FI < 30$).
   - `TIER_2_EFFICIENT_VOLUME`: Moderate contribution ($\$1,200\text{--}\$1,999/\text{hr}$) with high case velocity.
   - `TIER_3_MARGIN_DILUTER`: Low contribution ($< \$1,200/\text{hr}$) or negative margin due to high implant cost.
   - `TIER_4_HIGH_FRICTION`: Chronic denials ($DR \ge 12\%$) or pre-auth friction requiring revenue cycle intervention.

## Data Model / Schema
PostgreSQL migration `094_cpt_intelligence.sql` establishes:
1. `public.cpt_intelligence_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `specialty VARCHAR(64) NOT NULL`
   - `anatomic_category VARCHAR(64)`
   - `annual_case_volume INTEGER NOT NULL DEFAULT 0`
   - `avg_scheduled_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `avg_actual_or_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `p80_duration_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `avg_turnover_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `total_billed_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `total_direct_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `implant_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `supply_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `medicare_asc_base_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `commercial_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `medicare_parity_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
   - `first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `denial_overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `avg_days_to_pay NUMERIC(5, 1) NOT NULL DEFAULT 0.0`
   - `avg_documentation_lag_days NUMERIC(4, 1) NOT NULL DEFAULT 0.0`
   - `procedural_friction_index NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `performance_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_2_EFFICIENT_VOLUME'`
   - `primary_opportunity VARCHAR(256)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_cpt_facility UNIQUE (facility_id, cpt_code)`
2. `public.cpt_surgeon_performance_breakdown`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE`
   - `surgeon_name VARCHAR(128) NOT NULL`
   - `case_count INTEGER NOT NULL DEFAULT 0`
   - `avg_skin_to_skin_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0`
   - `p80_duration_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0`
   - `avg_supply_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `avg_implant_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `avg_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.cpt_payer_reimbursement_spread`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `payer_name VARCHAR(256) NOT NULL`
   - `claims_count INTEGER NOT NULL DEFAULT 0`
   - `contract_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `actual_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `medicare_parity_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
   - `first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `primary_denial_reason VARCHAR(128)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. Analytical Views:
   - `vw_cpt_intelligence_summary`: Aggregated specialty-level procedural volume, margin, and velocity.
   - `vw_cpt_margin_friction_radar`: Identifies high-volume procedures with abnormal denial friction or negative margin variance.
5. Row Level Security & Indexes:
   - RLS enabled on all tables enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## Business Rules
1. **Case Contribution Margin ($CM_{\text{cpt}}$):**
   $$CM_{\text{cpt}} = R_{\text{net}} - (C_{\text{implant}} + C_{\text{supply}} + C_{\text{labor}})$$
2. **Margin Per OR-Hour ($Yield_{\text{OR\_hour}}$):**
   If actual OR minutes $> 0$:
   $$Yield_{\text{OR\_hour}} = \left(\frac{CM_{\text{cpt}}}{T_{\text{OR\_minutes}}}\right) \times 60$$
   Otherwise, default to $0.00$.
3. **Medicare ASC Parity Percentage:**
   If Medicare ASC base rate $> 0$:
   $$\text{Medicare Parity } \% = \left(\frac{A_{\text{actual}}}{R_{\text{medicare\_base}}}\right) \times 100$$
4. **Operative Duration Deviation:**
   $$\Delta T = T_{\text{actual}} - T_{\text{P80}}$$
   Positive values signify scheduling overruns; negative values represent rapid execution.
5. **First-Pass Denial Rate:**
   $$DR_{\text{cpt}} = \left(\frac{\text{Denied Cases}}{\text{Total Claims}}\right) \times 100$$
6. **Procedural Friction Index ($FI_{\text{cpt}}$):**
   $$FI_{\text{cpt}} = \min(100, \max(0, (0.50 \times DR) + (0.30 \times \text{DaysToPay} \times 2) + (0.20 \times \text{DocLagDays} \times 10)))$$

## Permissions / Security
- **Organization & Facility Multi-Tenancy:** Strictly partition all CPT metrics and cross-surgeon breakdowns by `facility_id`.
- **Role-Based Access Control (RBAC):**
  - View Access: `administrator`, `executive`, `clinical_director`, `or_manager`, `biller`, `analyst`.
  - Export & Strategy Modification: `administrator`, `executive`, `clinical_director`.
  - Payer Rate Redlines: `administrator`, `executive`, `managed_care_director`.

## API / Service Requirements
- `cptIntelligenceService.js` provides:
  - `calculateCptContributionMargin(netCollections, totalDirectCost)`
  - `calculateCptMarginPerOrHour(contributionMargin, actualOrMinutes)`
  - `calculateCptMedicarePercent(actualAllowed, medicareAscBaseRate)`
  - `calculateCptDurationVariance(actualDuration, p80Duration)`
  - `calculateCptDenialRate(deniedCases, totalCases)`
  - `calculateCptFrictionIndex(denialRate, daysToPay, documentationLagDays)`
  - `classifyCptTier(marginPerOrHour, frictionIndex)`
  - `calculateFacilityCptKpis(cptList)`

## UI / Workflow Requirements
- **Executive 5-Card Ribbon:**
  1. Total Evaluated CPT Codes (Active catalog count).
  2. Average Contribution Margin per OR-Hour ($\$1,842/\text{hr}$).
  3. Portfolio Medicare ASC Parity Percentage ($194.2\%$).
  4. Average First-Pass Procedural Denial Rate ($7.8\%$).
  5. High-Friction Actionable Procedures ($3$ flagged codes).
- **Tab 1: CPT Portfolio Economics & Yield Matrix:** Filterable table by surgical specialty and performance tier with search, CPT descriptor, case count, duration, margin per hour, Medicare %, denial rate, and dossier drilldown.
- **Tab 2: Surgeon Technique & Duration Variance:** Side-by-side comparison of credentialed surgeons performing the same CPT code, highlighting skin-to-skin time deviations and implant cost variations.
- **Tab 3: Denial Friction & Payer Reimbursement Spread:** Detailed adjudication matrix showing commercial vs Medicare rates and primary CARC denial root causes.
- **Pinned CPT Drilldown Modal:** Complete dossier with procedural margin waterfall, surgeon efficiency leaderboard, payer reimbursement spread, and actionable margin playbook.

## Audit / Provenance
- All CPT metrics retain `facility_id`, `created_at`, `updated_at`, and calculation formula version metadata.
- Adjustments to target preference cards or documentation workflows log user identity and before/after states.

## QA / Test Cases
1. Validate canonical CPT categories, specialties, and tier constants.
2. Validate deterministic formulas: contribution margin, margin per OR-hour, Medicare parity, duration variance, and friction index.
3. Validate facility KPI aggregations across 10 diverse ambulatory surgical procedures.
4. Validate Migration 094 UP and DOWN SQL integrity (tables, views, indexes, RLS).
5. Enforce Maestro Clinical Design System Zero-Purple compliance in JSX and CSS.
6. Verify App.jsx navigation and tab routing.

## Acceptance Criteria
- Production build passes (`npm run build`).
- Unit and integration tests pass (`node --test tests/cpt-intelligence.test.js`).
- Full Module 11 test suite passes without regressions.
- Zero purple/violet tokens in components or stylesheets.
- Clean multi-tenant isolation enforced.

## Dependencies
- Phase 17: CPT Master & Code Normalization
- Phase 19: CPT Specialty & Anatomic Mapping
- Phase A8: P80 Operative Duration Predictions
- Phase B1: Surgeon Financial Scorecard
- Phase B3: Payer Intelligence

## Definition of Done
The CPT Intelligence feature is considered complete when the 14-section specification, PostgreSQL migrations, deterministic calculation engine, Maestro clinical UI, App.jsx wiring, comprehensive test suite, and clean production build have all been executed, verified, and committed to git.

## Implementation Notes
- Migration `094_cpt_intelligence.sql` and `094_cpt_intelligence_down.sql` created.
- Deterministic service `src/services/cptIntelligenceService.js` and facade wrapper `src/lib/cptIntelligenceService.js` created.
- Maestro clinical UI `src/components/CptIntelligenceView.jsx` and scoped CSS `src/components/CptIntelligenceView.css` created.
- Shell wiring updated in `src/App.jsx`.
- Verified with `node --test tests/cpt-intelligence.test.js` and `npm run build`.
