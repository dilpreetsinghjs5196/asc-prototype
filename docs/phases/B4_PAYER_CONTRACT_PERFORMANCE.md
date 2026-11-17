# B4 PAYER CONTRACT PERFORMANCE

## Purpose
Contract-vs-actual payer reimbursement performance, fee schedule compliance, carve-out recovery, renewal notice countdowns, and contract negotiation intelligence. This specification defines production standards for evaluating commercial and governmental payer contract execution across ambulatory surgery centers (ASCs). It establishes deterministic mathematical models for measuring contract compliance yield, identifying procedural fee leakage, auditing high-cost implant carve-outs, tracking auto-renewal notice windows, and generating data-driven negotiation playbooks.

## Scope
- Define production requirements for the Payer Contract Performance Subsystem within Module 11 (Surgeon & Clinical Intelligence / Executive Intelligence).
- Preserve full backward compatibility with the Payer Master (Phase 41), Payer Contract Model & Rate Rules (Phases 42-43), Claims & Remittance Ingestion (Phases 80-83), Recurring Underpayment Patterns (Phase 93C), and Payer Intelligence (Phase B3).
- Establish auditable, server-authoritative calculations for contract compliance yield, contractual leakage variance, implant carve-out recovery percentage, renewal notice countdowns, negotiation leverage scoring, and annual revenue uplift.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Implement role-based access control (RBAC): Executive Director, CFO, Managed Care Director, Revenue Cycle Director, and Financial Analyst can access contract terms, performance scorecards, and negotiation term sheets.

## Current State
- **Phase 41 (Payer Master & Plan Directory):** Maintains normalized payer catalogs (`public.payer_master`, `public.facility_payers`, `public.payer_plans`) with EDI routing.
- **Phase 42-43 (Payer Contract Model & Rate Rules):** Defines commercial fee schedules, case rates, carveouts, and contract versioning (`public.payer_contracts`, `public.payer_contract_versions`, `public.payer_contract_rate_schedules`).
- **Phase 70 / 93C (Recurring Underpayment Patterns):** Aggregates multi-claim batches of underpaid encounters.
- **Phase B3 (Payer Intelligence):** Provides high-level payer economics, adjudication velocity, first-pass denial friction, and AR aging buckets.
- **Contract Performance Gap:** While contracts and fee schedule rate rules exist in the database, ASC leadership lacks an automated, contract-level yield engine that compares expected allowable amounts against actual 835 remittance allowables per contract exhibit. Managed care directors track contract expiration dates manually on spreadsheets, frequently missing mandatory 60-day or 90-day written notice deadlines to prevent unfavorable auto-renewals. Furthermore, facilities lack empirical procedural data when sitting across the negotiation table from major commercial health plans.
- **Classification:**
  - Payer Master & Contract Tables (`payer_contracts`, `payer_contract_versions`): **KEEP**.
  - Rate Schedule Line Items (`payer_contract_rate_schedules`): **KEEP**.
  - General Payer Intelligence (`payer_intelligence_metrics`): **KEEP**.
  - Dedicated Payer Contract Performance & Negotiation Engine: **MISSING** (Implemented in Phase B4).

## Target State
1. **Contract-vs-Actual Reimbursement Reconciliation:**
   - **Contract Expected Allowable ($E_{\text{exp}}$):** Authoritative allowable reimbursement calculated from the active contract exhibits, CPT fee schedules, % of Medicare ASC base rates, or contracted case rate packages.
   - **Actual Allowed Amount ($A_{\text{act}}$):** Total allowable reimbursement acknowledged and adjudicated by the payer on EDI 835 remittances.
   - **Contract Compliance Yield ($Y_{\text{contract}}$):**
     $$Y_{\text{contract}} = \left(\frac{A_{\text{act}}}{E_{\text{exp}}}\right) \times 100$$
   - **Contractual Leakage Variance ($V_{\text{leak}}$):** Total underpayment deficit between contracted entitlement and actual adjudicated payment:
     $$V_{\text{leak}} = \max(0, E_{\text{exp}} - A_{\text{act}})$$
2. **Reimbursement Methodology Yield Profiling:**
   - **Commercial Fee Schedule Exhibits:** Line-item CPT rate compliance.
   - **Percent of Medicare ASC Base Rates:** Tracking contract conversion factor (e.g., 185% or 220% of current Medicare rate).
   - **Case Rate Bundles:** Procedural package profitability vs facility direct cost.
   - **Implant & High-Cost Consumable Carve-Outs:** Evaluating device invoice cost + markup recovery on Revenue Code 0278.
   - **Carve-Out Recovery Rate ($R_{\text{carveout}}$):**
     $$R_{\text{carveout}} = \left(\frac{\text{Carveout Dollars Recovered}}{\text{Carveout Acquisition Invoiced}}\right) \times 100$$
3. **Contract Renewal Radar & Notice Countdown:**
   - **Renewal Notice Deadline ($D_{\text{notice}}$):** Date by which formal written termination or renegotiation notice must be received by the payer to prevent evergreen auto-renewal:
     $$D_{\text{notice}} = D_{\text{expiration}} - N_{\text{notice\_days}}$$
   - **Days Until Notice Cutoff ($\Delta D_{\text{notice}}$):**
     $$\Delta D_{\text{notice}} = D_{\text{notice}} - D_{\text{current}}$$
   - **Renegotiation Status Lifecycle:**
     - `CRITICAL_RENEWAL_ALERT`: $\Delta D_{\text{notice}} \le 60$ days. Immediate executive intervention required.
     - `RENEGOTIATION_WINDOW_OPEN`: $60 < \Delta D_{\text{notice}} \le 120$ days. Term sheet preparation and active bargaining.
     - `MONITORING`: $\Delta D_{\text{notice}} > 120$ days. Standard yield tracking.
     - `LOCKED_AUTO_RENEWED`: Notice deadline passed without action; contract auto-renewed for 12 months.
     - `IN_ACTIVE_BARGAINING`: Formal redline exchange or mediation in progress.
4. **Negotiation Leverage Scoring & Target Playbooks:**
   - **Negotiation Leverage Score (0 – 100):** Multi-factor composite index evaluating procedural volume market share, contract yield leakage, margin contribution per OR-hour, and notice urgency.
   - **Potential Annual Revenue Uplift ($\Delta R_{\text{annual}}$):** Projected financial benefit from targeted rate renegotiation:
     $$\Delta R_{\text{annual}} = A_{\text{act}} \times \left(\frac{\text{Proposed Rate Increase } \%}{100}\right)$$
   - **Data-Driven Term Sheet Recommendations:** Procedural exhibits where reimbursement is below regional benchmarks, recommendations to replace case rates with carve-outs, and statutory prompt-pay enforcement terms.

## Data Model / Schema
PostgreSQL migration `093_payer_contract_performance.sql` establishes:
1. `public.payer_contract_performance_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `contract_id UUID REFERENCES public.payer_contracts(id) ON DELETE CASCADE`
   - `payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL`
   - `contract_number VARCHAR(80) NOT NULL`
   - `contract_name VARCHAR(256) NOT NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `payer_name VARCHAR(256) NOT NULL`
   - `reimbursement_methodology VARCHAR(40) NOT NULL DEFAULT 'FEE_SCHEDULE'`
   - `effective_date DATE NOT NULL`
   - `expiration_date DATE NOT NULL`
   - `renewal_notice_deadline DATE NOT NULL`
   - `days_until_notice_cutoff INTEGER NOT NULL DEFAULT 0`
   - `renegotiation_status VARCHAR(32) NOT NULL DEFAULT 'MONITORING'`
   - `total_cases_volume INTEGER NOT NULL DEFAULT 0`
   - `total_billed_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `contract_expected_allowed NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `actual_allowed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `contract_compliance_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
   - `contract_leakage_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
   - `implant_carveout_spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `implant_carveout_recovered NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `implant_carveout_recovery_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `avg_contribution_margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `negotiation_leverage_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `negotiation_priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM'` -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
   - `proposed_rate_adjustment_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `potential_annual_uplift NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `primary_negotiation_target VARCHAR(256)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_payer_contract_performance UNIQUE (facility_id, contract_number, effective_date, expiration_date)`
2. `public.payer_contract_cpt_yields`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `contract_performance_id UUID REFERENCES public.payer_contract_performance_metrics(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `specialty VARCHAR(64) NOT NULL`
   - `case_count INTEGER NOT NULL DEFAULT 0`
   - `contract_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `actual_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `unit_variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `total_variance NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. **Analytical Views:**
   - `public.vw_payer_contract_performance_summary`: Comprehensive contract yield, leakage, and renewal countdowns.
   - `public.vw_contract_renegotiation_pipeline`: Filtered pipeline of expiring contracts, leverage scores, and uplift opportunities.
4. **Row Level Security (RLS):**
   - Multi-tenant facility isolation via `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`.

## Business Rules
1. **Deterministic Yield Math:** Expected contracted allowable must be strictly greater than zero; if zero, yield is set to 0.00%.
2. **Leakage Variance Invariance:** Contractual leakage represents underpayments ($E_{\text{exp}} > A_{\text{act}}$). Overpayments/incentives do not produce negative leakage.
3. **Renewal Notice Date Calculation:** Renewal notice deadline is calculated strictly by subtracting `renewal_notice_days` from `expiration_date`.
4. **Status Transition Rule:** If $\Delta D_{\text{notice}} \le 60$, status must automatically transition to `CRITICAL_RENEWAL_ALERT` unless already marked `IN_ACTIVE_BARGAINING`.
5. **Implant Carve-Out Audit:** If contract terms specify invoice cost + markup on Revenue Code 0278, any claim paid below invoice cost triggers an automated carve-out underpayment flag.
6. **Negotiation Uplift Invariance:** Uplift projections apply strictly to actual historical allowed revenue.

## Permissions / Security
- **View Access:** `super_admin`, `org_admin`, `facility_admin`, `cfo`, `managed_care_director`, `revenue_cycle_director`, `financial_analyst`.
- **Edit / Term Sheet Approval:** `super_admin`, `org_admin`, `cfo`, `managed_care_director`.
- **Prohibited:** Unauthenticated or clinical-only roles cannot access negotiated commercial contract rates or negotiation playbooks.

## API / Service Requirements
- Service module: `src/services/payerContractPerformanceService.js` (and wrapper `src/lib/payerContractPerformanceService.js`).
- Authoritative methods:
  - `calculateContractYieldPct(actualAllowed, expectedAllowed)`
  - `calculateContractLeakage(expectedAllowed, actualAllowed)`
  - `calculateDaysUntilNoticeCutoff(targetNoticeDate, currentDate)`
  - `classifyRenegotiationStatus(daysUntilNoticeCutoff, currentStatus)`
  - `calculateImplantCarveoutRecoveryPct(recovered, spend)`
  - `calculatePotentialAnnualUplift(currentActualAllowed, proposedRateAdjustmentPct)`
  - `calculateNegotiationLeverageScore(volumeSharePct, yieldDeficitPct, marginPerOrHour, daysUntilNotice)`
  - `calculateFacilityContractKpis(contractList)`
  - Seed dataset (`SEED_PAYER_CONTRACT_PERFORMANCE`) across 8 major commercial/managed care contracts.

## UI / Workflow Requirements
1. **Top Executive Metric Ribbon (5 Cards):**
   - Expected Contract Allowable ($\$$).
   - Actual Allowed Realized ($\$$ and $\%$ yield, benchmark $\ge 95\%$).
   - Total Contract Leakage Variance ($\$$ identified underpayment).
   - Contracts in Renegotiation Window (Count of critical/active renewal alerts).
   - Potential Annual Renegotiation Uplift ($\$$ total projected revenue increase).
2. **Three-Tab Clinical & Financial Interface:**
   - **Tab 1: Contract Performance Matrix:** Comprehensive table detailing Contract Name, Payer, Methodology, Expiration Date, Notice Cutoff Days, Status, Expected Allowed, Actual Allowed, Yield %, Leakage $, Priority, and Action button.
   - **Tab 2: Negotiation Strategy & Renewal Radar:** Countdown timeline, leverage scoring, proposed rate adjustment %, projected uplift $, and targeted negotiation exhibits.
   - **Tab 3: CPT & Carve-Out Yield Audit:** Procedural yield breakdown across top CPT codes and high-cost implant carveout recovery audit.
3. **Pinned Contract Drilldown Modal:**
   - Fixed header, scrollable body (`overflow-y: auto`), and pinned footer.
   - Detailed breakdown of selected contract: methodology parameters, CPT fee schedule exhibit comparison, leakage root causes, and negotiation term sheet exporter.
4. **Maestro Clinical Design System (Strict Zero-Purple):**
   - Palette: Emerald (`#059669`), Amber (`#d97706`), Crimson (`#dc2626`), Blue (`#0284c7`), Slate/Neutral backgrounds. Zero purple/indigo tokens. Full `[data-theme="dark"]` support.

## Audit / Provenance
- All contract evaluations preserve facility ID, contract ID, version number, calculation timestamp, and source claims count.
- Migration history preserved via sequential numbering (`093_payer_contract_performance.sql`).
- Idempotent rollback script provided (`093_payer_contract_performance_down.sql`).

## QA / Test Cases
- Unit tests for all deterministic calculation functions (yield %, leakage variance, days to notice, status classification, carveout recovery %, uplift $, leverage score).
- Edge-case testing: zero expected allowable, zero carveout spend, negative days past notice date, 100% yield.
- Database migration integrity tests for UP and DOWN SQL files.
- Zero-Purple compliance automated scanner for JSX and CSS.
- Application navigation and routing integration tests in `src/App.jsx`.

## Acceptance Criteria
- [x] Canonical specification authored in `ASCANALYST_MD_SPECS` and `docs/phases/`.
- [x] Database migration `093_payer_contract_performance.sql` and rollback `093_payer_contract_performance_down.sql` authored with multi-tenant RLS.
- [x] Deterministic service layer `src/services/payerContractPerformanceService.js` and `src/lib/payerContractPerformanceService.js` implemented.
- [x] Maestro clinical UI `src/components/PayerContractPerformanceView.jsx` and scoped CSS `src/components/PayerContractPerformanceView.css` implemented (Strictly Zero-Purple, dark mode supported, pinned modal layout, responsive 5-card ribbon).
- [x] Component wired into `src/App.jsx` under Clinical navigation, header title/subtitle, date filter exclusion, and tab view rendering.
- [x] Unit test suite `tests/payer-contract-performance.test.js` created and passing.
- [x] Production build passes cleanly (`npm run build`).
- [x] All changes committed to git branch `feature/phase-80-claims-model`.

## Dependencies
- Upstream: Phase 41 (Payer Master), Phase 42-43 (Payer Contracts & Rate Rules), Phase 80-83 (Claims & Remittance), Phase 93C (Underpayment Patterns), Phase B3 (Payer Intelligence).
- Downstream: Phase B5 (CPT Intelligence), Phase B6 (CPT Economics), Phase B7 (CPT Denial & Payment Performance).

## Definition of Done
A feature is complete when the specification, database migrations, deterministic calculations, multi-tenant RLS, Maestro clinical UI, test suites, and application wiring are verified with clean automated execution.

## Implementation Notes
- Migration: `093_payer_contract_performance.sql` and `093_payer_contract_performance_down.sql`.
- Services: `src/services/payerContractPerformanceService.js`, `src/lib/payerContractPerformanceService.js`.
- Components: `src/components/PayerContractPerformanceView.jsx`, `src/components/PayerContractPerformanceView.css`.
- App Wiring: `src/App.jsx` (tab `payer_contract_performance`).
- Tests: `tests/payer-contract-performance.test.js`.
