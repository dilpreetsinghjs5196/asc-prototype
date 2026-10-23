# 46 CHARGE COMPLETENESS ENGINE SPECIFICATION — ASCANALYST PLATFORM

**Document Version:** 2.0.0  
**Phase:** 46 — Missing CPT / Modifier / Unit / Device Charge Detection & Pre-Bill Completeness Rules Engine  
**Status:** IMPLEMENTATION COMPLETE & VERIFIED (READY FOR PRODUCTION RELEASE)  
**Target Architecture:** Multi-Tenant Ambulatory Surgery Center (ASC) Enterprise Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Implementation Completed:** 2026-10-23  
**Implementation Mode:** COMPLETE (Migration 023 Deployed, Service Hardening Implemented, 100% Tests Green, 0 Lint Errors)  
**Upstream Dependencies:** Phase 40 (`cpt_master`), Phase 41 (`cms_asc_coverage_and_payment`), Phase 44 (`cpt_billing_rules`, `cpt_modifiers_units_laterality`), Phase 45 (`cpt_versioning_and_licensed_content`), Phase 10 (`surgery_procedures`, 1NF line items)  

---

## 1. Executive Summary & Production Requirements

### 1.1 Purpose & Scope
In Ambulatory Surgery Centers (ASCs), billing leakage, delayed claim scrubbing, and unitemized implant charges represent major sources of revenue cycle friction and CMS claim denials. Pre-bill charge completeness auditing ensures that every surgical encounter is scrubbed against clinical documentation, procedural necessity, coding conventions, and device cost recovery rules **before** a claim is released to clearinghouses or payers.

Phase 46 delivers an authoritative, deterministic pre-bill Charge Completeness Engine that enforces:
1. **Procedural Completeness:** Guarantees that every non-cancelled surgical encounter has at least one valid primary procedure code, operative notes are logged, and secondary procedures adhere to NCCI bundling.
2. **Device-Intensive & Implant Charge Completeness:** Mandates itemized device attribution (HCPCS C-codes, serial numbers, lot numbers, invoice tracking, acquisition cost, and markups) for any procedure flagged by CMS Addenda as device-intensive.
3. **Modifier & Laterality Integrity:** Enforces mandatory laterality modifiers (`LT`, `RT`, `50`) for bilateral anatomic procedures, preventing Medicare rejection.
4. **Units & MUE Boundary Enforcement:** Restricts billed units to CMS Medically Unlikely Edit (MUE) thresholds, flagging excess units as hard blockers.
5. **Auditable Administrative Clearance Workflow:** Provides an auditable state machine (`CLEARED`, `BLOCKED`, `OVERRIDDEN`) where critical blockers can only be bypassed with formal clinical/billing justifications recorded in immutable audit logs.

### 1.2 Implementation Summary
- **Migration 023 Deployed:**
  - `public.case_devices`: Itemized device tracking with C-code, serial number, lot number, invoice, unit cost, and unit charge.
  - `public.charge_completeness_runs`: Authoritative run log capturing rule evaluation timestamps, counts, and clearance status.
  - `public.charge_completeness_findings`: Granular rule findings tracking rule code, severity (`BLOCKER`, `WARNING`, `INFO`), description, and administrative overrides.
  - Repaired `fn_validate_case_procedures`: Resolved historical flaw where encounters with 0 procedure lines erroneously passed validation (`can_approve = true`).
  - Stored procedure `fn_evaluate_charge_completeness`: Authoritative server-side evaluation of all 12 deterministic rules.
  - Multi-tenant Row-Level Security (RLS) deployed across all new schema tables.
- **Financial Calculation Engine Correction:**
  - Repaired line 93 in `src/services/aiOperations/FinancialEngine.js` ensuring allowable reimbursement (`reimbursement: reimbursement`) is returned rather than chargemaster gross charge.
- **RBAC Hardening:**
  - Registered `billing.view_completeness`, `billing.override_blocker`, and `billing.signoff_prebill` in `src/lib/rbacService.js` and role catalogs.
- **Client Service Layer (`src/lib/supabase.js`):**
  - Exposed RPC wrappers for completeness evaluation, findings review, justified override submission, pre-bill signoff, and device CRUD operations.
- **User Interface (`PrebillCompletenessModal.jsx` & `SurgeryScheduler.jsx`):**
  - Deployed comprehensive Pre-Bill Completeness Review modal with rule badges, itemized device tables, override dialogs, and signoff triggers.
- **Quality Gates:**
  - 18/18 tests pass in `tests/charge-completeness-engine.test.js`.
  - 477/477 tests pass across 100 test suites in `npm test`.
  - 0 ESLint errors in `npm run lint`.

---

## 2. Current State vs Target State Architecture

### 2.1 Deficiency Analysis & Remediations

| Area | Pre-Phase 46 State | Verified Deficiency | Production Remediation (Phase 46) |
| :--- | :--- | :--- | :--- |
| **Encounter Validation** | `fn_validate_case_procedures` iterated over existing procedure lines. | If a surgery had 0 procedure lines, loop ran 0 times, returning `can_approve = true` and `error_lines = 0`. | If `v_total_lines = 0` and status is not cancelled, function sets `can_approve = false` and registers error `PROC-001`. |
| **Implant Tracking** | `surgeries.implants_cost` numeric column. | Lump-sum dollar amount without itemization, serial numbers, lot numbers, or HCPCS C-codes. | Implemented `public.case_devices` table capturing itemized line items, C-codes, serial/lot tracking, and supplier invoices. |
| **Financial Engine** | `FinancialEngine.js` line 93 returned `reimbursement: grossCharge`. | Overrode allowable reimbursement with 350% gross chargemaster price during estimation. | Corrected to return calculated allowable reimbursement (`reimbursement: reimbursement`) alongside `grossCharge`. |
| **Pre-Bill Clearance** | No pre-bill scrub workflow. | Claims released to billing without automated completeness check or signoff audit trail. | Introduced `charge_completeness_runs` and `charge_completeness_findings` with clearance state machine and RBAC-gated signoff. |
| **RBAC Controls** | Broad `billing.*` permissions. | Lack of granular permissions for overriding compliance blockers or clearing pre-bill claims. | Added `billing.view_completeness`, `billing.override_blocker`, and `billing.signoff_prebill`. |

---

## 3. Data Model & Database Schema (Migration 023)

### 3.1 Schema Definition

#### `public.case_devices` (Itemized Implant & Device Line Items)
```sql
CREATE TABLE IF NOT EXISTS public.case_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    cpt_code_id BIGINT REFERENCES public.cpt_codes(id) ON DELETE SET NULL,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    hcpcs_c_code VARCHAR(10),
    device_name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(100),
    model_number VARCHAR(100),
    serial_number VARCHAR(100),
    lot_number VARCHAR(100),
    invoice_number VARCHAR(100),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0),
    unit_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_charge >= 0),
    total_cost NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    total_charge NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_charge) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `public.charge_completeness_runs` (Audit Execution & Clearance Record)
```sql
CREATE TABLE IF NOT EXISTS public.charge_completeness_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_by UUID,
    total_rules_evaluated INT NOT NULL DEFAULT 0,
    blockers_count INT NOT NULL DEFAULT 0,
    warnings_count INT NOT NULL DEFAULT 0,
    info_count INT NOT NULL DEFAULT 0,
    clearance_status VARCHAR(20) NOT NULL DEFAULT 'BLOCKED' 
        CHECK (clearance_status IN ('CLEARED', 'BLOCKED', 'OVERRIDDEN')),
    signed_off_by UUID,
    signed_off_at TIMESTAMPTZ,
    signoff_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `public.charge_completeness_findings` (Granular Rule Findings)
```sql
CREATE TABLE IF NOT EXISTS public.charge_completeness_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.charge_completeness_runs(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    rule_code VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('BLOCKER', 'WARNING', 'INFO')),
    description TEXT NOT NULL,
    affected_entity VARCHAR(100),
    entity_id VARCHAR(100),
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    overridden_by UUID,
    overridden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Deterministic Pre-Bill Completeness Rules

The stored procedure `fn_evaluate_charge_completeness` evaluates 12 deterministic rules across procedure lines, device items, and clinical documentation:

| Rule Code | Rule Name | Severity | Condition & Evaluation Logic | Remediation / Resolution |
| :--- | :--- | :---: | :--- | :--- |
| **RULE-01** | Primary Procedure Required | **BLOCKER** | Non-cancelled case has 0 active procedure lines (`surgery_procedures`). | Add primary CPT code before scrubbing claim. |
| **RULE-02** | Device-Intensive Implant Attribution | **BLOCKER** | CPT has `is_device_intensive = true` (or device offset > 0) but `case_devices` has 0 rows and `implants_cost = 0`. | Document itemized implant hardware or C-code in Device Tracking. |
| **RULE-03** | Missing Operative Documentation | **BLOCKER** | Case is completed/scheduled but has empty operative notes / report. | Surgeon or circulating nurse must submit operative report. |
| **RULE-04** | Missing Bilateral Modifier | **BLOCKER** | CPT billing rules require bilateral modifier (`bilateral_indicator = 1`), but lines lack `50`, `LT`, or `RT`. | Attach modifier `50`, `LT`, or `RT` based on clinical documentation. |
| **RULE-05** | Units Exceed MUE Limit | **BLOCKER** | Procedure line `units` exceeds CMS Medically Unlikely Edit limit in `cpt_billing_rules`. | Adjust units to permitted limit or supply clinical justification. |
| **RULE-06** | Zero/Negative Charge Line | **BLOCKER** | Procedure line has `charged_amount <= 0.00` without approved zero-charge flag. | Enter gross chargemaster fee or unbundling override. |
| **RULE-07** | High-Cost Device C-Code Missing | **WARNING** | Device line item exceeds $500 cost but lacks valid HCPCS C-code. | Provide manufacturer C-code for Medicare passthrough reimbursement. |
| **RULE-08** | Unitemized Lump-Sum Implants | **WARNING** | `surgeries.implants_cost > 0` but `case_devices` has 0 itemized rows. | Itemize implants to capture supplier invoice and serial numbers. |
| **RULE-09** | Missing Anesthesia Charge/Type | **WARNING** | Surgery duration > 30 minutes with general/regional anesthesia but no anesthesia record. | Link anesthesia care team record and billing line. |
| **RULE-10** | Multiple Modifiers Sequencing | **INFO** | Line item has multiple modifiers; checks sequencing (informational vs pricing). | Informational notice on payer-specific modifier ordering. |
| **RULE-11** | Non-Covered ASC Procedure | **WARNING** | CPT code has `is_asc_covered = false` in CMS ASC payment tables. | Obtain advance beneficiary notice (ABN) or verify commercial coverage. |
| **RULE-12** | Unacknowledged AMA Content | **INFO** | Procedure lines billed without recorded AMA copyright acknowledgment. | Automatic verification of platform AMA copyright agreement. |

---

## 5. Security, Tenancy & RBAC

### 5.1 Multi-Tenant Row-Level Security (RLS)
All Phase 46 tables enforce facility isolation:
```sql
ALTER TABLE public.case_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_completeness_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_completeness_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_devices_tenant_policy ON public.case_devices
    FOR ALL USING (
        facility_id IS NULL OR 
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
```

### 5.2 Granular RBAC Permissions
Registered in `src/lib/rbacService.js`:
- `billing.view_completeness`: Enables viewing pre-bill scrub findings, rule severities, and itemized hardware.
- `billing.override_blocker`: Allows administrative override of critical blockers with mandatory justification text.
- `billing.signoff_prebill`: Authoritative sign-off and transition of case to cleared billing state.

---

## 6. Client Services & Frontend Architecture

### 6.1 Database Client (`src/lib/supabase.js`)
- `evaluateChargeCompleteness(surgeryId)`: Invokes `fn_evaluate_charge_completeness` RPC.
- `getLatestCompletenessRun(surgeryId)`: Returns latest evaluation and clearance status.
- `getCompletenessFindings(runId)`: Retrieves individual finding lines and override states.
- `overrideCompletenessFinding(findingId, reason)`: Validates reason non-empty, checks user identity, and updates finding.
- `clearCompletenessRun(runId, notes)`: Confirms 0 unresolved blockers before applying authoritative clearance.
- `getCaseDevices(surgeryId)` / `addCaseDevice` / `updateCaseDevice` / `deleteCaseDevice`: Complete device tracking CRUD.

### 6.2 Pre-Bill Review UI Modal (`PrebillCompletenessModal.jsx`)
Features:
- Dynamic status banner showing clearance status (`CLEARED`, `BLOCKED`, `OVERRIDDEN`).
- Findings breakdown tabs for Rules vs Itemized Devices.
- Interactive Blocker Override dialog with mandatory justification textarea.
- Re-evaluate button for on-demand re-scrubbing.
- Pre-bill sign-off trigger disabled while active blockers persist.

---

## 7. Verification & Quality Gates

### 7.1 Automated Verification Suite (`tests/charge-completeness-engine.test.js`)
The dedicated test suite covers 5 domains across 18 automated tests:
1. **Database Migration 023 DDL & Constraints:** Validates schema creation, zero-procedure repair, rule evaluation RPC, and rollback script.
2. **Financial Engine Reimbursement Integrity:** Verifies line 93 fix ensuring allowable reimbursement is not replaced by gross charges.
3. **RBAC Hardening:** Verifies catalog registration and role mappings for completeness permissions.
4. **Client Service Clearance Logic:** Verifies RPC wrappers, mandatory override justifications, and blocker enforcement during sign-off.
5. **Component Architecture & Integration:** Verifies `PrebillCompletenessModal.jsx` and `SurgeryScheduler.jsx` integration.

### 7.2 Test & Lint Results
- `node --test tests/charge-completeness-engine.test.js`: **18/18 tests pass (100%)**.
- `npm test`: **477/477 tests pass across 100 test suites (100%)**.
- `npm run lint`: **0 errors, 8 warnings (clean exit code 0)**.
