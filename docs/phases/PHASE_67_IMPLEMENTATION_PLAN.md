# PHASE 67 — IMPLEMENTATION PLAN
## Structured 5-Stage Roadmap for Commercial Rate Rules & Financial Adjudication

> **Module:** Commercial Rate Rules & Financial Adjudication Engine  
> **Target Migration:** `043_payer_contract_rate_rules.sql` (Planning Reference Only)  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY AUDIT STAGE  
> **Upstream Dependencies:** Phases 60–66 Verified

---

## 1. Roadmap Overview & Execution Principles

This implementation plan outlines the sequential steps required to build, test, and release **Phase 67: Payer Contract Rate Rules** once the formal `GO` authorization is granted.

### Core Execution Safeguards:
1. **Zero Downtime Migration:** All DDL migrations must be backward-compatible, using idempotent statements (`IF NOT EXISTS`, `ON CONFLICT DO UPDATE`).
2. **Deterministic Test-First Verification:** Unit and integration tests must run all 5 mathematical scenarios from `PHASE_67_CALCULATION_EXAMPLES.md` to within \$0.01 precision before releasing UI.
3. **Strict Design Token Governance:** UI components must strictly adhere to the Maestro design system (Crisp Slate, Emerald, Amber, Rose; strictly zero `#7c3aed`, `#8b5cf6`, purple, or violet).

---

## 2. Five-Stage Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 67 IMPLEMENTATION TIMELINE                       │
├─────────┬──────────────────────────────────────────┬────────────────────────────┤
│ Stage   │ Description                              │ Key Deliverables           │
├─────────┼──────────────────────────────────────────┼────────────────────────────┤
│ Stage 1 │ Database Schema & Core Stored Procedures │ Migration 043 DDL & RPCs   │
│ Stage 2 │ Defect Remediation & Legacy Bridges      │ Eradicate hardcoded 0.65   │
│ Stage 3 │ TypeScript Services & Vitest Test Suite  │ payerRateService & tests   │
│ Stage 4 │ UI Rate Exhibit Manager & Simulator      │ React Components & Views   │
│ Stage 5 │ End-to-End Verification & Sign-Off       │ Audit validation & CI run  │
└─────────┴──────────────────────────────────────────┴────────────────────────────┘
```

---

## 3. Detailed Stage Breakdown

### Stage 1: Database Migration `043_payer_contract_rate_rules.sql`
- **1.1 Table DDL Execution:**
  - Create `payer_contract_rate_schedules`
  - Create `payer_contract_cpt_rates`
  - Create `payer_contract_case_rates`
  - Create `payer_contract_case_rate_inclusions`
  - Create `payer_contract_carve_outs`
  - Create `payer_contract_rate_exceptions`
  - Create `payer_contract_rate_calculations`
  - Create `payer_contract_rate_calculation_lines`
  - Create `payer_contract_rate_import_batches`
  - Create `payer_contract_rate_import_staging`
- **1.2 Constraints & Triggers:**
  - Enforce `trg_lock_contract_rates_on_approval()` to lock rate exhibits when a contract version transitions to `ACTIVE` or `APPROVED`.
- **1.3 Stored Procedures & Calculation Engines:**
  - `fn_resolve_contract_rate()`: Multi-methodology rate resolver.
  - `fn_calculate_commercial_reimbursement()`: Master case adjudication orchestrator.
  - `fn_stage_rate_schedule_import()`: CSV batch staging parser.
  - `fn_commit_rate_schedule_version()`: Atomic batch committer.
- **1.4 RLS Policies:**
  - Implement tenancy filters using `public.is_facility_accessible(facility_id)`.
  - Enforce immutable `SELECT`-only policies on calculation tables.

---

### Stage 2: Defect Remediation & Service Decoupling
- **2.1 Eradicate Hardcoded 35% Discount:**
  - Refactor `src/services/payerContractService.js` (line 425): Remove `gross * 0.65` fallback.
  - Replace with dynamic server-side contract lookup.
- **2.2 Bridge Legacy Fee Schedule Tables:**
  - Create view `payer_fee_schedules_v2` redirecting legacy read calls to `payer_contract_cpt_rates`.
- **2.3 Sanitize J8 Device Offset Handling:**
  - Validate that device offsets are subtracted from Medicare baselines before applying multipliers when an implant carve-out is present.

---

### Stage 3: TypeScript Service Layer & Automated Tests
- **3.1 Service Implementation:**
  - Author `src/services/payerRateService.ts` exposing typed client methods:
    - `resolveContractRate()`
    - `adjudicateCase()`
    - `getCalculationSnapshot()`
    - `uploadFeeScheduleCSV()`
    - `commitStagedSchedule()`
- **3.2 Vitest Test Suite:**
  - Author `src/test/unit/payerRateRules.test.ts`:
    - Test Case 1: Rotator cuff repair + J8 tenodesis + carve-out (Verify \$13,536.04 total).
    - Test Case 2: Knee scope with 50% MPPR secondary cascade (Verify \$4,100.00 total).
    - Test Case 3: Cataract case rate with Toric IOL upgrade (Verify \$2,250.00 payer + \$1,000.00 patient).
    - Test Case 4: Spine fusion catastrophic stop-loss trigger (Verify \$60,320.00 settlement).
    - Test Case 5: Bilateral carpal tunnel 200% exception (Verify \$3,200.00 allowable).
  - Target: 100% test pass rate across all rate rule calculations.

---

### Stage 4: Frontend UI Components (Maestro Compliant)
- **4.1 Rate Schedules & Exhibits Tab:**
  - Integrated into existing `src/pages/PayerContracts/ContractDetailView.jsx`.
  - Displays exhibits: Fee Schedules, Case Rates, Carve-Outs, Exceptions.
- **4.2 CSV/Excel Import Modal:**
  - Drag-and-drop file upload with pre-commit validation preview.
  - Color-coded validation status (Emerald for valid, Amber for warnings, Rose for syntax errors).
- **4.3 Case Rate Package Builder:**
  - UI for defining bundled CPT packages and included ancillary supplies.
- **4.4 Adjudication Simulator & Audit Inspector:**
  - Live simulation tab allowing billing analysts to test surgical cases against draft contracts.
  - Visual breakdown of base allowable, modifier reductions, MPPR discounts, and carve-out lines.

---

### Stage 5: Verification, Benchmarking, & Sign-Off
- **5.1 Performance SLA Verification:**
  - Adjudicate single case in < 50ms.
  - Ingest 3,000 CPT CSV schedule in < 3.0 seconds.
- **5.2 CI/CD Verification:**
  - Full test suite execution: `npm test` (all tests passing).
  - Production build verification: `npm run build` (zero errors).
  - Linter audit: `npm run lint` (zero warnings/errors).
- **5.3 Executive Sign-Off:**
  - CFO and Managed Care Director approval of the calculation audit ledger.

