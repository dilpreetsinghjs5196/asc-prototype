# G2 FINANCIAL COMPLETENESS

## Purpose
The Financial Completeness module enforces deterministic financial completeness rules, margin readiness checks, and executive trust thresholds across the ASCANALYST platform. Before revenue, cost, EBITDA, surgeon profitability, or cash forecasts are surfaced in Executive Board Packages (Phase E6) or AI Analyst narratives, Phase G2 verifies that every billing charge, direct supply/implant invoice, clinical labor allocation, 835 ERA cash remittance, and General Ledger journal batch is complete and balanced within strict facility tolerances.

---

## Scope
- Define production requirements for **Financial Completeness & Trust Thresholds (Phase G2)**:
  1. **Trust Threshold Configuration (`fin_completeness_configs`)**: Facility-level financial trust floors (`BOARD_TRUSTED >= 96%`, `PROVISIONAL_ESTIMATE >= 88%`, below `88%` → `UNRELIABLE_HOLD`), maximum allowed bank-to-subledger cash variance (`$1.00`), Board export hold switch, AI recommendation gate, and masked secrets.
  2. **5-Pillar Financial Completeness Rubric (`fin_completeness_pillars`)**: Configurable weights strictly summing to `100.00%`:
     - **Revenue & Charge Completeness (`25%`)**: Zero unbilled completed cases, contracted payer fee schedules attached.
     - **Direct Cost & Implant COGS (`25%`)**: All implant constructs and supply consumptions matched to contracted/invoiced acquisition costs.
     - **Labor & Overhead Allocation (`20%`)**: Direct OR/PACU/CRNA payroll hours allocated per case without missing shifts.
     - **Cash & 835 Remittance Reconciliation (`15%`)**: 4-way balancing across 837 Claims, 835 ERAs, and EFT bank deposits.
     - **GL Closing Period Integrity (`15%`)**: Double-entry balance invariance ($\sum \text{Dr} - \sum \text{Cr} = 0$) and cutoff completeness.
  3. **Accounting Period Trust Scorecards (`fin_period_trust_assessments`)**: Monthly period readiness scorecards (`2026-02`, `2026-01`, etc.) with financial exposure metrics, cash variance, and 64-character SHA-256 trust seals.
  4. **Case Margin Completeness (`fin_case_margin_readiness`)**: Encounter-level verification proving both Revenue and Complete Direct Costs (Supply/Implant + Labor) exist prior to reporting case contribution margin.
  5. **Financial Blind-Spot Exceptions (`fin_completeness_exceptions`)**: Quarantines missing implant COGS, unbilled surgical cases, cash variances, and missing labor allocations with **Remediate** and **Post Accrual Estimate** workflows.
  6. **Audit Runs (`fin_trust_gate_audit_runs`) & Provenance (`fin_completeness_provenance_ledger`)**: Historical audit runs and immutable SHA-256 ledger.
- Enforce facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/dataQualityFrameworkService.js` | **KEEP** | Enterprise 6-dimension DQI framework (Phase G0). |
| `src/services/caseCompletenessService.js` | **KEEP** | Clinical/operational per-case completeness scoring (Phase G1). |
| `src/services/accountingIntegrationService.js` | **KEEP** | GL double-entry and bank reconciliation gateway (Phase F6). |
| `src/services/clearinghouseIntegrationService.js` | **KEEP** | 837/835 ERA balancing engine (Phase F5). |
| `src/services/financialCompletenessService.js` | **KEEP** | Phase 76 financial completeness & GL audit readiness engine preserved. |
| `src/components/FinancialCompletenessView.jsx` | **KEEP** | Phase 76 UI preserved cleanly alongside Phase 16 G2. |
| `public.fin_completeness_configs` | **MISSING** | Facility financial trust thresholds and Board/AI gating policy. |
| `public.fin_completeness_pillars` | **MISSING** | 5-pillar financial completeness weights (100.00% conservation). |
| `public.fin_period_trust_assessments` | **MISSING** | Monthly accounting period completeness scorecards and trust tiers. |
| `public.fin_case_margin_readiness` | **MISSING** | Encounter-level margin integrity verification table. |
| `public.fin_completeness_exceptions` | **MISSING** | Financial exposure workqueue for missing costs/unbilled cases. |
| `public.fin_trust_gate_audit_runs` | **MISSING** | Batch trust threshold audit log with SHA-256 seals. |
| `public.fin_completeness_provenance_ledger` | **MISSING** | Immutable audit provenance table for financial trust decisions. |
| `src/services/dqFinancialCompletenessService.js` | **MISSING** | Authoritative trust threshold and case margin completeness engine. |
| `src/components/DqFinancialCompletenessView.jsx` | **MISSING** | UI dashboard for financial completeness, margins, and trust gates. |

---

## Target State
1. **Deterministic Financial Trust Score**:
   $$\text{Financial Trust Score} = \sum_{p=1}^{5} \left( \text{Pillar Score}_p \times \frac{\text{Pillar Weight}_p}{100} \right), \quad \sum_{p=1}^{5} \text{Pillar Weight}_p = 100.00$$
2. **Trust Gate Classification Rules**:
   - **`BOARD_TRUSTED`**: $\text{Score} \ge 96.0$ **and** `critical_imbalances_count == 0` **and** `cash_variance_usd <= $1.00`.
   - **`PROVISIONAL_ESTIMATE`**: $88.0 \le \text{Score} < 96.0$ **and** `critical_imbalances_count == 0` **and** `cash_variance_usd <= $1.00`.
   - **`UNRELIABLE_HOLD`**: $\text{Score} < 88.0$ **or** `critical_imbalances_count > 0` **or** `cash_variance_usd > $1.00`.
3. **Case Margin Integrity Guard**:
   - A case's contribution margin cannot be marked `MARGIN_VERIFIED` unless Billed Revenue $> 0$, Direct Labor Cost is allocated, and Direct Supply/Implant COGS are verified.

---

## Data Model / Schema
Defined in `supabase/migrations/134_financial_completeness.sql`:
1. `public.fin_completeness_configs`
2. `public.fin_completeness_pillars`
3. `public.fin_period_trust_assessments` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
4. `public.fin_case_margin_readiness`
5. `public.fin_completeness_exceptions`
6. `public.fin_trust_gate_audit_runs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
7. `public.fin_completeness_provenance_ledger` (`sha256_seal VARCHAR(128) NOT NULL`)
- Telemetry aggregation view: `public.vw_financial_completeness_telemetry`.
- Tenant isolation enforced via `app.current_facility_id` RLS policies on all 7 tables.

---

## Business Rules

### Rule 1: Financial Pillar Conservation Invariant
The 5 financial completeness pillar weights must strictly sum to `100.00%` (`±0.01%`). Violations throw `ERR_FCS_PILLAR_SUM_INVALID`.

### Rule 2: Cash Variance & Imbalance Lockout
Any cash reconciliation variance exceeding `max_cash_variance_usd` (`$1.00`) or any unresolved `CRITICAL` double-entry / 835 remittance imbalance forces the accounting period into `UNRELIABLE_HOLD`, blocking final Board Certification.

### Rule 3: Accrual Estimate Safeguard
Missing vendor invoices or pending implant COGS may be bridged temporarily via an explicit `ACCRUED_ESTIMATE` resolution entry, promoting the period to `PROVISIONAL_ESTIMATE` with full audit trail metadata.

### Rule 4: Cryptographic Sealing
Every trust assessment and audit run writes an exact 64-character SHA-256 seal (`sha256_fcs_` prefix + 53 hex chars).

---

## Permissions / Security
- Facility-level RLS isolation (`app.current_facility_id`).
- Secrets masked in client responses (`fcs_sec_****_...`).
- RBAC Matrix:
  - `CFO` / `Finance Director`: Approve accrual estimates, adjust trust floors, certify month-end Board packages.
  - `Controller` / `Revenue Cycle Lead`: Remediate unbilled cases, cash variances, and missing COGS.
  - `Financial Analyst` / `AI Analyst`: Read-only access to trust scores, margin readiness, and exception logs.

---

## API / Service Requirements
`src/services/financialCompletenessService.js` and facade `src/lib/financialCompletenessService.js`:
- `getFinCompletenessConfig(facilityInput)`
- `updateFinCompletenessConfig(facilityInput, updates)`
- `getFinCompletenessTelemetry(facilityInput)`
- `getFinCompletenessPillars(facilityInput)`
- `getFinPeriodTrustAssessments(facilityInput)`
- `getFinCaseMarginReadiness(facilityInput)`
- `getFinCompletenessExceptions(facilityInput)`
- `getFinAuditRuns(facilityInput)`
- `validateFinPillarWeights(pillars)`
- `calculateFinancialTrustScore(params)`
- `evaluateCaseMarginCompleteness(caseFinancials)`
- `triggerFinancialTrustAudit(facilityInput, operatorId)`
- `resolveFinCompletenessException(exceptionId, action, operatorId, notes)`

---

## UI / Workflow Requirements
Component `src/components/FinancialCompletenessView.jsx` and `src/components/FinancialCompletenessView.css`:
- **Header Action Bar**: Live period trust badge (`BOARD_TRUSTED` / `PROVISIONAL_ESTIMATE` / `UNRELIABLE_HOLD`), "Verify Financial Pillars", "Run Trust Audit", Settings trigger.
- **4-Card Telemetry Ribbon**: Period Financial Trust Score, Margin-Verified Cases %, Cash Recon Variance ($), Financial Exposure on Hold ($).
- **5-Pillar Financial Completeness Grid**: Live progress & weights across Revenue Charges (25%), Direct COGS (25%), Labor/Overhead (20%), Cash/835 Recon (15%), GL Integrity (15%).
- **4 Subtabs**:
  1. *Period Trust Scorecards* (`2026-02`, `2026-01`, with trust tier and SHA-256 seals).
  2. *Case Margin Completeness* (Per-case verification that Revenue + Supply/Implant Cost + Labor Cost are complete).
  3. *Financial Blind-Spot Exceptions* (Actionable dollar exposures with **Remediate** and **Post Accrual** buttons).
  4. *Audit Gate History* (Batch scans with 64-char SHA-256 seals).
- **Zero Prohibited Tokens**: Strictly zero purple, violet, indigo, magenta, or fuchsia tokens; `padding: 0` on `.fcs-container`.

---

## Audit / Provenance
- All trust calculations, accrual overrides, and period certifications preserve user identity, timestamp, and immutable SHA-256 seals in `fin_completeness_provenance_ledger`.

---

## QA / Test Cases
Automated test suite `tests/financial-completeness.test.js`:
1. Telemetry returns accurate financial trust metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution across strings and objects.
3. Configuration retrieval and masked secret verification (`fcs_sec_****_...`).
4. 5-pillar weight conservation validator (accepts 100.00%, rejects invalid totals).
5. Deterministic `calculateFinancialTrustScore` returns `BOARD_TRUSTED`, `PROVISIONAL_ESTIMATE`, and `UNRELIABLE_HOLD` (including cash variance & critical override).
6. Deterministic `evaluateCaseMarginCompleteness` distinguishes `MARGIN_VERIFIED`, `MISSING_IMPLANT_COST`, `MISSING_LABOR_COST`, and `UNBILLED_REVENUE`.
7. Case margin readiness catalog retrieval across surgical encounters.
8. Resolving / accruing open financial exceptions clears critical imbalances and promotes period trust tier.
9. Batch trust audit scan generates run record with exact 64-char `sha256_fcs_` seal.
10. Dual facade re-export parity (`src/services/` vs `src/lib/`).
11. Migration 134 UP/DOWN SQL structural integrity and RLS policies.
12. Strict zero-prohibited token compliance and `src/App.jsx` shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- All 156 tests across F0–F9 + G0–G2 pass cleanly.
- Tenant isolation verified across all 7 tables.
- Zero prohibited accent tokens.

---

## Dependencies
- Upstream: Phase G0 (`Data Quality Framework`), Phase G1 (`Case Completeness Score`), Phase F5–F9.
- Database: Migration 134 (`supabase/migrations/134_financial_completeness.sql`).

---

## Definition of Done
Phase G2 is complete when Migration 134 UP/DOWN, `financialCompletenessService.js`, `src/lib/financialCompletenessService.js`, `FinancialCompletenessView.jsx/.css`, `src/App.jsx` shell integration, 12 passing tests in `tests/financial-completeness.test.js`, full regression run, and clean production build pass.

---

## Implementation Notes
- **Branch:** `data-quality-works`
- **Files Created:** `docs/phases/G2_FINANCIAL_COMPLETENESS.md`, `ASCANALYST_MD_SPECS/Phase_16_Data_Quality/G2_FINANCIAL_COMPLETENESS.md`, `supabase/migrations/134_financial_completeness.sql`, `134_financial_completeness_down.sql`, `src/services/dqFinancialCompletenessService.js`, `src/lib/dqFinancialCompletenessService.js`, `src/components/DqFinancialCompletenessView.jsx`, `src/components/DqFinancialCompletenessView.css`, `tests/financial-completeness.test.js`.
- **Files Modified:** `src/App.jsx` (`dq_financial_completeness` tab with `Scale` icon, preserving Phase 76 `financial_completeness`).
