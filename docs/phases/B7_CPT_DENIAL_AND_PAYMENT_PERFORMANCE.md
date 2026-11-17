# B7 CPT DENIAL AND PAYMENT PERFORMANCE

## Purpose
CPT denial patterns, payment speed, underpayment, and payer variation across ambulatory surgical procedures. This specification establishes production standards for procedural revenue cycle intelligence across the facility's CPT catalog. It defines deterministic, auditable rules to identify first-pass denial friction, claim adjudication velocity (days to pay), root-cause Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC), overturn recovery effectiveness, contractual underpayment fee leakage, and cross-payer payment variation.

## Scope
- Define production requirements for the CPT Denial and Payment Performance Subsystem within Module 11 (Surgeon & Clinical Intelligence / Executive Intelligence).
- Preserve compatibility with CPT Master & Normalization (Phase 17), Claim Scrubber Rules (Phase 24), Claims & Remittances (Phases 80-83), Denial Recovery Prioritization (Phase 93B), Recurring Underpayment Detection (Phase 93C), Payer Intelligence (Phase B3), Payer Contract Performance (Phase B4), CPT Intelligence (Phase B5), and CPT Economics (Phase B6).
- Use deterministic, server-authoritative calculations for first-pass denial rates, clean claim rates, average days to pay, overturn rates, underpayment variances, and payment velocity indices.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS) with `app.current_facility_id`.
- Support Role-Based Access Control (RBAC): Administrators, CFOs, Business Office Managers, Revenue Cycle Directors, Billing Specialists, and Financial Analysts can inspect procedural payment friction, track appeal yields, and resolve systemic payer adjudication delays.

## Current State
- **Phase 17 (CPT Master & Code Normalization):** Maintains normalized procedure catalogs (`public.cpt_codes`) and surgical categories.
- **Phase 24 (Claim Scrubber & Pre-Bill Validation):** Runs deterministic pre-submission rules to catch missing modifiers or laterality mismatches before 837 generation.
- **Phase 80-83 (Claims & Remittance Pipeline):** Ingests EDI 837 claims and 835 ERA remittances with CARC/RARC line-level adjustments.
- **Phase 93B (Denial Prioritization):** Groups case-level denials into appeal workqueues based on recovery yield and filing deadlines.
- **Phase 93C (Recurring Underpayments):** Flags aggregate variance between contracted fee schedules and paid amounts.
- **Phase B3 (Payer Intelligence):** Evaluates overall payer-level portfolio economics, turnaround speed, and aggregate denial rates.
- **Phase B5 (CPT Intelligence) & B6 (CPT Economics):** Measures procedural clinical durations, Medicare parity spreads, contribution margins, and suite hourly yields.
- **CPT Denial & Payment Gap:** While broad payer-level metrics and case-level denial tickets exist, ASC leadership lacks a procedure-specific denial and payment velocity intelligence engine. Leadership cannot easily discern why a specific CPT (e.g., 29827 Rotator Cuff Repair or 31255 Ethmoidectomy) experiences a 16% denial rate with Commercial Payer A while paying cleanly in 18 days with Commercial Payer B. Furthermore, facilities cannot correlate specific CARC codes (such as `CO-50` medical necessity or `CO-197` prior authorization) back to procedure coding habits to prevent pre-bill revenue erosion.
- **Classification:**
  - Claim Ledger & ERA Pipelines: **KEEP**.
  - Payer Level Intelligence (`payer_intelligence_metrics`): **KEEP**.
  - Broad Procedural Profiling (`cpt_intelligence_metrics`): **KEEP**.
  - Dedicated CPT Denial & Payment Performance Subsystem: **MISSING** (Implemented in Phase B7).

## Target State
1. **Procedural Payment Performance Tiers:**
   Every evaluated CPT code is categorized into one of 4 standardized operational flow tiers:
   - `EXCELLENT_FLOW`:
     - Clean Claim Rate $\ge 95.0\%$, First-Pass Denial $\le 4.0\%$, Days to Pay $\le 21$ days, Overturn Rate $\ge 90.0\%$.
     - Rapid turnaround, frictionless revenue cycle flow.
   - `ACCEPTABLE_FLOW`:
     - First-Pass Denial $4.1\%\text{--}8.0\%$, Days to Pay $22\text{--}30$ days, Clean Claim Rate $\ge 88.0\%$.
     - Standard ASC commercial adjudication velocity with low manual intervention.
   - `FRICTION_AT_RISK`:
     - First-Pass Denial $8.1\%\text{--}14.0\%$, Days to Pay $31\text{--}45$ days, or Overturn Rate $< 65.0\%$.
     - Heightened payer scrutiny, documentation submission requests, or moderate appeal cycles.
   - `CHRONIC_DENIAL_SINK`:
     - First-Pass Denial $> 14.0\%$, Days to Pay $> 45$ days, or Contractual Underpayment Rate $> 12.0\%$.
     - High administrative burden, severe cash lockup, and frequent hard denials requiring clinical escalation.

2. **Deterministic Mathematical Formulas:**
   - **First-Pass Denial Rate ($DR_{\text{cpt}}$):**
     $$DR_{\text{cpt}} = \left(\frac{N_{\text{denied}}}{N_{\text{total\_billed}}}\right) \times 100$$
   - **Clean Claim Rate ($CCR_{\text{cpt}}$):**
     $$CCR_{\text{cpt}} = \left(\frac{N_{\text{clean}}}{N_{\text{total\_billed}}}\right) \times 100$$
   - **Adjudication Velocity / Days to Pay ($DTP_{\text{cpt}}$):**
     Average days elapsed between claim transmission (EDI 837) and 835 electronic remittance advice:
     $$DTP_{\text{cpt}} = \frac{1}{N_{\text{paid}}} \sum_{i=1}^{N_{\text{paid}}} (\text{Date}_{\text{remit}, i} - \text{Date}_{\text{submitted}, i})$$
   - **Denial Overturn Rate ($OR_{\text{cpt}}$):**
     Percentage of appealed denials successfully overturned with cash recovery:
     $$OR_{\text{cpt}} = \left(\frac{N_{\text{overturned}}}{N_{\text{appealed}}}\right) \times 100$$
   - **Contractual Underpayment Rate ($UPR_{\text{cpt}}$):**
     $$UPR_{\text{cpt}} = \left(\frac{N_{\text{underpaid}}}{N_{\text{paid}}}\right) \times 100$$
   - **Contractual Underpayment Variance ($\Delta_{\text{underpaid}}$):**
     Cumulative dollar leakage where actual allowed amount is below contracted fee schedule:
     $$\Delta_{\text{underpaid}} = \sum \max(0, \text{ContractedRate} - \text{AllowedAmount})$$
   - **Payment Velocity Index ($PVI_{\text{cpt}}$):**
     Normalized 0-100 composite liquidity score:
     $$PVI = \operatorname{clamp}\left(0, 100, 100 - (DR \times 2.0) - (\max(0, DTP - 15) \times 1.2) - (UPR \times 1.0) + (OR \times 0.2)\right)$$

3. **CARC & RARC Root-Cause Decomposition:**
   - Granular breakdown of top rejection reasons:
     - `CO-50`: Medical Necessity / Clinical Criteria Non-Compliance.
     - `CO-197`: Pre-certification / Prior Authorization Absent or Mismatched.
     - `CO-97`: Unbundled / Incidental procedure disallowed under CCI / NCCI edits.
     - `CO-16`: Claim lacks necessary clinical records or operative report.
     - `CO-45`: Charge exceeds contractual allowable / disputed fee schedule underpayment.
     - `CO-18`: Duplicate billing.
   - Pre-bill scrubbing rule correlation: Identifies which billing edits could have caught the denial prior to transmission.

4. **Payer Variation Matrix:**
   - Cross-payer comparative view for each CPT:
     - Comparison across Commercial Payers (BCBS, UHC, Aetna, Cigna) versus Medicare and Medicaid.
     - Identifies outlier payers with abnormal lag (> 45 days) or disproportionate denial rates for standard ASC surgical codes.

## Data Model / Schema
PostgreSQL migration `096_cpt_denial_and_payment_performance.sql` establishes:
1. `public.cpt_denial_payment_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `specialty VARCHAR(64) NOT NULL`
   - `total_billed_claims INTEGER NOT NULL DEFAULT 0`
   - `clean_claims_count INTEGER NOT NULL DEFAULT 0`
   - `clean_claim_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `first_pass_denied_claims INTEGER NOT NULL DEFAULT 0`
   - `first_pass_denial_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `appealed_claims_count INTEGER NOT NULL DEFAULT 0`
   - `overturned_claims_count INTEGER NOT NULL DEFAULT 0`
   - `overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `overturned_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `underpaid_claims_count INTEGER NOT NULL DEFAULT 0`
   - `underpayment_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `underpayment_variance_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `aged_ar_over_90_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `payment_velocity_index NUMERIC(5, 1) NOT NULL DEFAULT 0.0`
   - `performance_tier VARCHAR(32) NOT NULL DEFAULT 'ACCEPTABLE_FLOW'`
   - `primary_carc_code VARCHAR(16)`
   - `primary_carc_description VARCHAR(256)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_cpt_denial_payment_facility UNIQUE (facility_id, cpt_code)`
2. `public.cpt_carc_denial_reasons`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `carc_code VARCHAR(16) NOT NULL`
   - `carc_category VARCHAR(64) NOT NULL`
   - `carc_description TEXT NOT NULL`
   - `occurrence_count INTEGER NOT NULL DEFAULT 0`
   - `denied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `preventable_by_scrubber BOOLEAN NOT NULL DEFAULT false`
   - `recommended_scrubber_rule VARCHAR(128)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.cpt_payer_payment_velocity`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `payer_name VARCHAR(256) NOT NULL`
   - `claims_count INTEGER NOT NULL DEFAULT 0`
   - `denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `underpayment_variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. `public.vw_cpt_denial_velocity_summary`:
   - Aggregates facility performance across surgical specialties.
5. `public.vw_cpt_underpayment_leakage_radar`:
   - Surfaces procedures with chronic contractual underpayment variance and extended adjudication lag.
6. Multi-Tenant RLS policies enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## Business Rules
1. **Zero Negative Counters:** Claims count, denials count, and appeals must be non-negative integers.
2. **Rate Clamping:** All percentage metrics (clean claim rate, denial rate, overturn rate, underpayment rate) are strictly bounded between $0.00\%$ and $100.00\%$.
3. **Deterministic Tier Assignment:**
   - If `first_pass_denial_rate > 14.0` OR `avg_days_to_pay > 45.0` OR `underpayment_rate_pct > 12.0` $\rightarrow$ `CHRONIC_DENIAL_SINK`.
   - Else if `first_pass_denial_rate > 8.0` OR `avg_days_to_pay > 30.0` OR `overturn_rate_pct < 65.0` $\rightarrow$ `FRICTION_AT_RISK`.
   - Else if `first_pass_denial_rate <= 4.0` AND `avg_days_to_pay <= 21.0` AND `clean_claim_rate >= 95.0` $\rightarrow$ `EXCELLENT_FLOW`.
   - Else $\rightarrow$ `ACCEPTABLE_FLOW`.
4. **Authoritative Calculation:** All financial sums and metrics are computed server-side or via verified pure functions; UI components do not fabricate metrics.
5. **Multi-Tenancy:** Cross-facility data leakage is strictly prohibited.

## Permissions / Security
- `analytics:view`: View procedural denial rates, days to pay, and payment velocity scores.
- `analytics:export`: Export procedural denial tables, CARC breakdowns, and payer matrices to CSV/JSON.
- `billing:appeal_action`: Generate appeal dossiers or flag claims for scrubber rule creation.
- RLS Policy: Direct tenant segregation on `cpt_denial_payment_metrics`, `cpt_carc_denial_reasons`, and `cpt_payer_payment_velocity`.

## API / Service Requirements
- Service module: `src/services/cptDenialPaymentService.js`
- Exported functions:
  - `calculateDenialRate(deniedClaims, totalClaims)`
  - `calculateCleanClaimRate(cleanClaims, totalClaims)`
  - `calculateDaysToPay(totalDays, paidClaims)`
  - `calculateOverturnRate(overturnedCount, appealedCount)`
  - `calculateUnderpaymentRate(underpaidCount, paidClaims)`
  - `calculateUnderpaymentVariance(expectedTotal, paidTotal)`
  - `calculatePaymentVelocityIndex(denialRate, daysToPay, underpaymentRate, overturnRate)`
  - `classifyPaymentPerformanceTier(denialRate, daysToPay, cleanClaimRate, overturnRate, underpaymentRate)`
  - `calculateFacilityDenialPaymentKpis(cptList)`
- Facade export wrapper: `src/lib/cptDenialPaymentService.js`.

## UI / Workflow Requirements
- **Top 5-Card Metric Ribbon:**
  1. *Total Evaluated Claims:* Total volume with clean claim percentage.
  2. *First-Pass Denial Rate:* Facility average denial percentage with benchmark indicator ($\le 8.0\%$).
  3. *Adjudication Velocity:* Average days to pay from 837 to 835 remittance.
  4. *Contractual Underpayment Variance:* Total dollar leakage across underpaid procedural claims.
  5. *Chronic Denial Sink Procedures:* High-friction codes requiring clinical or authorization escalation.
- **Three Core Analytical Tabs:**
  1. *Tab 1: CPT Denial & Payment Velocity Matrix:* Complete procedural table with specialty/tier filters, search, days to pay, denial rate, PVI score, and dossier trigger.
  2. *Tab 2: CARC Root-Cause & Scrubbing Radar:* Breakdown of primary denial reasons (`CO-50`, `CO-197`, `CO-97`, `CO-16`, etc.) with claim scrubber rule prevention indicators.
  3. *Tab 3: Payer Adjudication Variation & Overturn Audit:* Cross-payer variation matrix comparing commercial payers vs Medicare/Medicaid payment velocity and appeal success.
- **Pinned Procedural Dossier Modal:**
  - Deep-dive into a selected CPT code: historical denial trend, CARC breakdown, payer latency distribution, and actionable pre-bill scrubber recommendations.
- **Design System Standards:**
  - Scoped CSS prefix: `cptdp-`
  - Responsive ribbon grid: `repeat(auto-fit, minmax(190px, 1fr))` on `< 1300px`, `repeat(5, minmax(0, 1fr))` on `≥ 1300px`.
  - Zero-Purple strict clinical palette (Emerald, Sky Blue, Amber, Crimson, Slate).

## Audit / Provenance
- All modifications to metric thresholds or scrubber rules log user identity, timestamp, before/after values, and facility tenant ID.
- Views record provenance from electronic remits (ERA 835) and EDI 837 transactions.

## QA / Test Cases
- Deterministic formula tests: division by zero guards, boundary checks for percentages and days to pay.
- Performance tier classification tests: all 4 tiers thoroughly asserted.
- KPI aggregation tests: sum and average calculations across heterogeneous portfolios.
- Migration tests: verifying DDL tables, indexes, views, and RLS policies.
- UI styling and Zero-Purple compliance tests: static analysis verifying absence of prohibited tokens.
- Integration tests: verify `App.jsx` wiring and facade wrapper exports.

## Acceptance Criteria
- [x] All 14 specification sections defined.
- [x] Database migrations `096_cpt_denial_and_payment_performance.sql` and `096_cpt_denial_and_payment_performance_down.sql` created.
- [x] Backend service `src/services/cptDenialPaymentService.js` and lib wrapper created.
- [x] Clinical UI component `src/components/CptDenialPaymentView.jsx` and scoped CSS created.
- [x] App shell navigation and tab mounting configured in `src/App.jsx`.
- [x] Comprehensive test suite `tests/cpt-denial-payment.test.js` passing.
- [x] All Module 11 test suites passing together.
- [x] Clean `npm run build` with zero errors.

## Dependencies
- Upstream: Phase 17 (CPT Master), Phase 80-83 (Claims & Remittances), Phase 93B (Denial Recovery), Phase B3 (Payer Intelligence), Phase B5 (CPT Intelligence), Phase B6 (CPT Economics).
- Downstream: Phase B8 (Executive Intelligence & Board Reporting).

## Definition of Done
The phase is considered complete when the migration scripts, deterministic service layer, interactive clinical UI component, scoped styles, app shell routing, and test suites are committed and verified with zero build regressions.

## Implementation Notes
- Migration `096_cpt_denial_and_payment_performance.sql` establishes 3 tables, 2 analytical views, and RLS policies.
- Migration `096_cpt_denial_and_payment_performance_down.sql` provides clean rollback.
- Service `cptDenialPaymentService.js` provides 10 real-world surgical procedures with CARC distributions and payer variations.
- UI component adheres strictly to Maestro Clinical Design System with zero purple tokens.
