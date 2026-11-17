# B3 PAYER INTELLIGENCE

## Purpose
Payer economics, payment speed, first-pass denials, contractual underpayments, and accounts receivable (AR) aging analytics. This specification defines production standards for enterprise-grade payer portfolio intelligence within ambulatory surgery centers (ASCs). It establishes authoritative mathematical formulations for evaluating commercial and governmental payer yield, measuring adjudication turnaround velocity (Days to Pay / Days in AR), quantifying root-cause denial friction (CARC/RARC distributions), isolating systemic contractual underpayment leakage, and profiling delinquent AR aging risk.

## Scope
- Define production requirements for the Payer Intelligence Subsystem within Module 11 (Surgeon & Clinical Intelligence / Executive Intelligence).
- Preserve full backward compatibility with the Payer Master & Plan Directory (Phase 41), Payer Contract Model (Phase 42-43), Claims & Remittance Ingestion (Phase 80-83), Denial Recovery Systems (Phase 94), and Recurring Payer Underpayment Patterns (Phase 93C).
- Use deterministic, server-authoritative mathematical formulas for revenue realization rate, payment turnaround velocity, denial overturn efficiency, Payer Friction Index (PFI), and AR aging bucket distributions.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Implement role-based access control (RBAC): Executive Director, CFO, Revenue Cycle Director, Billing Manager, and Financial Analyst can access comparative payer scorecards, negotiate payer carve-outs, and review contract dispute packages.

## Current State
- **Phase 41 (Payer Master & Plan Directory):** Maintains normalized global and facility payer catalogs (`public.payer_master`, `public.facility_payers`, `public.payer_plans`) with HIPAA 5010 EDI 837/270/276 routing identifiers.
- **Phase 42-43 (Payer Contract Model & Rate Rules):** Defines commercial fee schedules, case rates, carveouts, and contract effective date windows.
- **Phase 70 (Recurring Payer Underpayment Patterns):** Detects repeated underpayment patterns across payers, health plans, and CPT codes (Migration 070).
- **Phase 80-83 (Claims & EDI 835 Remittance):** Ingests electronic remittances capturing gross charges, allowed amounts, contractual adjustments, patient deductibles/coinsurance, and paid cash.
- **Phase 94 (Denial Management):** Provides CARC/RARC categorization and recovery workqueues.
- **Payer Intelligence Gap:** Currently, ASC leadership lacks a unified executive scorecard that correlates payer-specific billed volume with true net cash yield, payment velocity, denial appeal overhead, underpayment exposure, and aged AR risk. Business office managers evaluate payers in silos (denials separately from contracts and AR), obscuring the true net economic cost of doing business with frictional commercial plans.
- **Classification:**
  - Payer Master & Plan Catalogs (`public.payer_master`, `public.facility_payers`): **KEEP**.
  - Contract Rules & Rate Tables (`payer_contracts`, `payer_contract_versions`): **KEEP**.
  - Payer Underpayment Patterns (`recurring_payer_underpayment_patterns`): **KEEP**.
  - Consolidated Executive Payer Intelligence Subsystem: **MISSING** (Implemented in Phase B3).

## Target State
1. **Payer Economics & Cash Realization:**
   - **Gross Billed Charges ($B$):** Total charges submitted on Form CMS-1450 / UB-04 across all encounters.
   - **Contractual Allowances ($A$):** Negotiated fee schedule discounts written off per provider agreements.
   - **Net Collections / Cash Realized ($C$):** Total primary, secondary, and tertiary cash payments received.
   - **Collection Realization Rate ($R_{\text{real}}$):**
     $$R_{\text{real}} = \left(\frac{C}{B}\right) \times 100$$
   - **Clean Claim First-Pass Payment Rate ($R_{\text{clean}}$):** Percentage of submitted claims adjudicated and paid on initial submission without denial, rejection, or request for information (RFI).
2. **Payment Turnaround Velocity (Days to Pay):**
   - **Days in AR / Turnaround Lag ($T_{\text{pay}}$):** Elapsed calendar days from 837 claim transmission date to 835 electronic remittance / check deposit date:
     $$T_{\text{pay}} = D_{\text{remittance}} - D_{\text{submission}}$$
   - **Statutory Prompt-Pay Compliance Rate:** Percentage of clean claims paid within state and federal statutory prompt-pay thresholds (e.g., 30 calendar days for electronic claims, 45 days for paper claims).
   - **Electronic Remittance Advice (ERA / 835) Adoption Rate:** Percentage of claims processed via automated electronic data interchange (EDI) vs. manual paper explanation of benefits (EOBs).
3. **Denial Profiles & Root-Cause Friction:**
   - **First-Pass Denial Rate ($R_{\text{denial}}$):**
     $$R_{\text{denial}} = \left(\frac{N_{\text{denied}}}{N_{\text{total\_claims}}}\right) \times 100$$
   - **Denial Overturn Resolution Rate ($R_{\text{overturn}}$):** Percentage of appealed denials successfully resolved with cash recovery.
   - **Primary CARC Denial Taxonomy:** Tracking frequency and financial impact of top Claim Adjustment Reason Codes:
     - `PR-197 / CO-197`: Pre-certification / Prior Authorization Absent or Inadequate.
     - `CO-50`: Non-covered Services / Medical Necessity Not Established.
     - `CO-29`: Timely Filing Limit Expired.
     - `CO-4`: Procedure Code Inconsistent with Modifier or Billing Guide.
     - `CO-27`: Expenses Incurred After Coverage Terminated.
4. **Contractual Underpayment & Fee Schedule Leakage:**
   - **Underpayment Incidence Rate ($R_{\text{underpay}}$):** Percentage of paid claims where the allowed amount is less than the contracted fee schedule baseline:
     $$R_{\text{underpay}} = \left(\frac{N_{\text{underpaid}}}{N_{\text{total\_claims}}}\right) \times 100$$
   - **Total Underpayment Variance ($V_{\text{underpay}}$):** Cumulative dollar deficit between contracted allowable fee and payer adjudicated allowable amount across all lines.
   - **Systemic Root Causes:** Multiple Procedure Payment Reduction (MPPR) over-discounting, implant carveout packaging, unbundling disputes, and out-of-date fee schedule table application.
5. **AR Aging Risk Exposure:**
   - Standard GAAP Aging Distribution across 5 chronological buckets:
     - Current ($0 - 30$ days)
     - $31 - 60$ days
     - $61 - 90$ days
     - $91 - 120$ days
     - $> 120$ days (Delinquent / High Bad Debt Exposure)
   - **Aged AR Exposure Ratio ($R_{\text{aged90}}$):** Percentage of outstanding AR balance exceeding 90 days past service date:
     $$R_{\text{aged90}} = \left(\frac{\text{AR}_{91-120} + \text{AR}_{>120}}{\text{Total Outstanding AR}}\right) \times 100$$
6. **Deterministic Payer Friction Index (PFI) & Tier Classification:**
   - A standardized, multi-factor operational friction index from 0 to 100 measuring administrative burden:
     $$\text{PFI} = \min\left(100, \left(0.25 \times \frac{T_{\text{pay}}}{60} \times 100\right) + (0.30 \times R_{\text{denial}}) + (0.25 \times R_{\text{underpay}}) + (0.20 \times R_{\text{aged90}})\right)$$
   - **Performance Tier Grading:**
     - **Grade A (PFI < 20):** High Performer / Preferred Payer (Fast payment, low denials, clean contract adherence).
     - **Grade B (20 ≤ PFI < 40):** Standard Partner (Acceptable turnaround, moderate appeal overhead).
     - **Grade C (40 ≤ PFI < 65):** Frictional Payer (Sluggish adjudication, high CARC-197/CO-50 rate, persistent underpayments).
     - **Grade D/F (PFI ≥ 65):** Critical Contract Risk (Severely delinquent AR, systemic non-payment, formal contract renegotiation or network termination candidate).

## Data Model / Schema
PostgreSQL migration `092_payer_intelligence.sql` establishes:
1. `public.payer_intelligence_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `payer_name VARCHAR(256) NOT NULL`
   - `payer_category VARCHAR(32) NOT NULL` (e.g., 'Commercial', 'Medicare', 'Medicaid', 'Medicare_Advantage', 'Workers_Comp')
   - `evaluation_period_start DATE NOT NULL`
   - `evaluation_period_end DATE NOT NULL`
   - `claims_count INTEGER NOT NULL DEFAULT 0`
   - `clean_claims_count INTEGER NOT NULL DEFAULT 0`
   - `total_billed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `total_contractual_adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `total_net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `realization_rate_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
   - `avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `era_adoption_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `prompt_pay_compliance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `first_pass_denial_count INTEGER NOT NULL DEFAULT 0`
   - `first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `denial_overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `total_denied_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `unrecovered_denied_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `underpayment_claims_count INTEGER NOT NULL DEFAULT 0`
   - `underpayment_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `total_underpayment_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `ar_current_30 NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `ar_31_60 NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `ar_61_90 NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `ar_91_120 NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `ar_over_120 NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `total_ar_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `aged_ar_over_90_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `payer_friction_index NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `performance_grade VARCHAR(4) NOT NULL DEFAULT 'B'`
   - `top_denial_carc VARCHAR(32)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_payer_intelligence_period UNIQUE (facility_id, payer_code, evaluation_period_start, evaluation_period_end)`
2. `public.payer_denial_reason_summaries`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `carc_code VARCHAR(16) NOT NULL`
   - `carc_description VARCHAR(256) NOT NULL`
   - `denial_count INTEGER NOT NULL DEFAULT 0`
   - `denied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `overturn_count INTEGER NOT NULL DEFAULT 0`
   - `overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. **Analytical Views:**
   - `public.vw_payer_intelligence_summary`: Aggregates payer economics, payment turnaround, and friction indices for executive reporting.
   - `public.vw_facility_payer_risk_overview`: Synthesizes facility-wide payer risk profile, total unrecovered denials, and aged AR exposures.
4. **Row Level Security (RLS):**
   - Mandatory facility isolation: `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`.

## Business Rules
1. **Realization Calculation:** Gross billed charges must be strictly greater than zero; if billed amount is zero, realization rate is set to 0.00%.
2. **Turnaround Lag Math:** Turnaround days must be non-negative. Adjudications occurring same-day are calculated as 0.0 days.
3. **Underpayment Threshold:** A claim is classified as underpaid only if the actual allowed amount on the 835 remittance is strictly less than the contractual expected allowable rate minus a \$1.00 rounding tolerance.
4. **Denial Rate Normalization:** First-pass denial rate is calculated as a fraction of total submitted claims. Secondary line-item denials on otherwise paid claims are recorded separately in line adjudication metrics.
5. **Prompt-Pay Statute Adherence:** Clean electronic claims unpaid after 30 calendar days automatically generate a statutory prompt-pay interest warning.
6. **Aged AR Safeguard:** Claims exceeding 90 days from service date trigger a Timely Filing & Recovery alert if unappealed.
7. **Payer Friction Index Invariance:** The PFI formula is deterministic, reproducible, and normalized between 0.00 and 100.00.

## Permissions / Security
- **View Access:** `super_admin`, `org_admin`, `facility_admin`, `cfo`, `revenue_cycle_director`, `billing_manager`, `financial_analyst`.
- **Export & Contract Dispute Preparation:** `super_admin`, `org_admin`, `facility_admin`, `cfo`, `revenue_cycle_director`.
- **Prohibited:** No unauthenticated or unauthorized role can access confidential payer contractual rates, underpayment figures, or physician fee schedules.

## API / Service Requirements
- Service module: `src/services/payerIntelligenceService.js` (and wrapper `src/lib/payerIntelligenceService.js`).
- Authoritative methods:
  - `calculateRealizationRate(collections, billed)`
  - `calculateDaysToPay(submissionDate, paymentDate)`
  - `calculateDenialRate(deniedClaims, totalClaims)`
  - `calculateDenialOverturnRate(overturnedCount, totalDeniedCount)`
  - `calculateUnderpaymentRate(underpaidCount, totalClaims)`
  - `calculateAgedArRatio(ar91To120, arOver120, totalAr)`
  - `calculatePayerFrictionIndex(daysToPay, denialRatePct, underpaymentRatePct, agedArOver90Pct)`
  - `classifyPayerGrade(payerFrictionIndex)`
  - `calculateFacilityPayerKpis(payerMetricsList)`
  - Seed dataset (`SEED_PAYER_INTELLIGENCE_METRICS`) with realistic ASC data across 8 major commercial and government payers.

## UI / Workflow Requirements
1. **Top Executive Metric Ribbon (5 Cards):**
   - Total Billed Charges & Realization Rate ($\$$ and $\%$, e.g., \$10.1M billed, 67.5% realization).
   - Average Turnaround Time (Days to Pay across portfolio, e.g., 32.4 days).
   - Portfolio First-Pass Denial Rate (e.g., 9.8%, with overturn indicator).
   - Contractual Underpayment Variance (Total identified underpayment dollars, e.g., \$417.7K).
   - Aged AR Exposure (> 90 Days Total and %, e.g., \$486.2K, 12.3%).
2. **Three-Tab Clinical & Financial Interface:**
   - **Tab 1: Payer Scorecard Matrix:** Comprehensive table detailing Payer Name, Category, Claim Count, Net Collections, Realization %, Days to Pay, Denial Rate %, Underpayment Dollars, Payer Friction Index (PFI), and Performance Grade badge.
   - **Tab 2: Denial & Underpayment Breakdown:** CARC analysis, top denial codes, overturn rates, root causes, and dispute opportunities.
   - **Tab 3: AR Aging & Exposure Distribution:** Stacked and tabular breakdown across 0-30, 31-60, 61-90, 91-120, and >120 day aging buckets with timely filing countdown alerts.
3. **Pinned Payer Drilldown Modal:**
   - Modal with fixed header, scrollable body (`overflow-y: auto`), and pinned footer.
   - Detailed breakdown of selected payer: revenue waterfall, monthly turnaround velocity, CARC denial code distribution, underpayment dispute summary, and contract negotiation tactics.
4. **Maestro Clinical Design System (Strict Zero-Purple):**
   - Standard semantic colors: Emerald (`#059669`) for Grade A / Efficient, Amber (`#d97706`) for Grade B / Moderate, Crimson (`#dc2626`) for Grade C/D / High Friction, Blue (`#0284c7`) for primary metrics. Zero purple, violet, indigo, magenta, or fuchsia tokens permitted. Full `[data-theme="dark"]` support.

## Audit / Provenance
- All metric aggregations preserve facility ID, evaluation start/end dates, source claim counts, and timestamp.
- Migration history preserved via sequential numbering (`092_payer_intelligence.sql`).
- Idempotent rollback script provided (`092_payer_intelligence_down.sql`).

## QA / Test Cases
- Unit tests for all deterministic mathematical formulas (realization, days to pay, denial rate, overturn rate, underpayment rate, aged AR ratio, PFI, and grade classification).
- Edge-case testing: zero billed charges, zero claims, zero AR balance, 100% denial rate.
- Database migration integrity tests for UP and DOWN SQL files.
- Zero-Purple compliance automated scanner for JSX and CSS.
- Application navigation and routing integration tests in `src/App.jsx`.

## Acceptance Criteria
- [x] Canonical specification authored in `ASCANALYST_MD_SPECS` and `docs/phases/`.
- [x] Database migration `092_payer_intelligence.sql` and rollback `092_payer_intelligence_down.sql` authored with multi-tenant RLS.
- [x] Deterministic service layer `src/services/payerIntelligenceService.js` and `src/lib/payerIntelligenceService.js` implemented.
- [x] Maestro clinical UI `src/components/PayerIntelligenceView.jsx` and scoped CSS `src/components/PayerIntelligenceView.css` implemented (Strictly Zero-Purple, dark mode supported, pinned modal layout).
- [x] Component wired into `src/App.jsx` under Clinical navigation, header title/subtitle, date filter exclusion, and tab view rendering.
- [x] Unit test suite `tests/payer-intelligence.test.js` created and passing.
- [x] Production build passes cleanly (`npm run build`).
- [x] All changes committed to git branch `feature/phase-80-claims-model`.

## Dependencies
- Upstream: Phase 41 (Payer Master), Phase 42-43 (Payer Contracts), Phase 80-83 (Claims & Remittance), Phase 93C (Underpayment Patterns), Phase 94 (Denial Management).
- Downstream: Phase B4 (Payer Contract Performance), Phase B7 (CPT Denial & Payment Performance).

## Definition of Done
A feature is complete when the specification, database migrations, deterministic calculations, multi-tenant RLS, Maestro clinical UI, test suites, and application wiring are verified with clean automated execution.

## Implementation Notes
- Migration: `092_payer_intelligence.sql` and `092_payer_intelligence_down.sql`.
- Services: `src/services/payerIntelligenceService.js`, `src/lib/payerIntelligenceService.js`.
- Components: `src/components/PayerIntelligenceView.jsx`, `src/components/PayerIntelligenceView.css`.
- App Wiring: `src/App.jsx` (tab `payer_intelligence`).
- Tests: `tests/payer-intelligence.test.js`.
