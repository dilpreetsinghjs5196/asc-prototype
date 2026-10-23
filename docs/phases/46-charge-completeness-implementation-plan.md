# Phase 46 Implementation Plan: Charge Completeness Engine

## Status: COMPLETED & VERIFIED (READY FOR PRODUCTION)

## Overview
Implement an authoritative pre-bill Charge Completeness Engine for Ambulatory Surgery Centers (ASCs). The system enforces 12 deterministic billing rules covering missing CPTs, unitemized device charges, required bilateral modifiers, missing operative notes, units validation, and revenue cycle clearance workflows before claims submission.

---

## 1. Database Migration: `023_charge_completeness_engine.sql` [COMPLETED]
- [x] **Itemized Device Attribution (`public.case_devices`)**:
  - Itemized implant/device tracking table with foreign keys to `surgeries`, `cpt_codes`, and `facilities`.
  - Captures `hcpcs_c_code`, `serial_number`, `lot_number`, `invoice_number`, `quantity`, `unit_cost`, `unit_charge`, and total amount calculations.
- [x] **Completeness Audit Run Logging (`public.charge_completeness_runs`)**:
  - Tracks execution runs, evaluated rule count, blockers count, warnings count, info count, and overall clearance status (`CLEARED`, `BLOCKED`, `OVERRIDDEN`).
  - Signed off metadata (`signed_off_by`, `signed_off_at`, `signoff_notes`).
- [x] **Granular Rule Findings (`public.charge_completeness_findings`)**:
  - Individual finding lines with rule code, severity (`BLOCKER`, `WARNING`, `INFO`), description, affected entity, and override tracking (`is_overridden`, `override_reason`, `overridden_by`, `overridden_at`).
- [x] **Zero-Procedure Case Repair (`fn_validate_case_procedures`)**:
  - Repaired historical logic flaw where cases with 0 procedure lines erroneously passed as `can_approve = true`.
  - Non-cancelled encounters with 0 procedure lines now return `can_approve = false` and trigger error `PROC-001`.
- [x] **Authoritative Stored Procedure (`fn_evaluate_charge_completeness`)**:
  - Deterministic evaluation of all 12 pre-bill completeness rules.
  - Automatically records run records and granular findings in an auditable transaction.
- [x] **Multi-Tenant Row-Level Security (RLS)**:
  - Deployed multi-tenant RLS policies across `case_devices`, `charge_completeness_runs`, and `charge_completeness_findings`.
- [x] **Reversible Rollback Script (`023_charge_completeness_engine_down.sql`)**:
  - Safely drops all new objects and restores preceding procedure logic.

---

## 2. Financial Engine Formula Correction (`src/services/aiOperations/FinancialEngine.js`) [COMPLETED]
- [x] Repaired line 93 of `estimateFinancials`:
  - Fixed erroneous fallback returning `grossCharge` under the `reimbursement` property.
  - Returns calculated allowable reimbursement (`reimbursement: reimbursement`) alongside chargemaster gross charges (`grossCharge: grossCharge`).

---

## 3. RBAC Security Hardening (`src/lib/rbacService.js`) [COMPLETED]
- [x] Added 3 new granular pre-bill completeness permissions:
  - `billing.view_completeness`: View pre-bill audit findings and device tracking.
  - `billing.override_blocker`: Justified administrative override of billing blockers.
  - `billing.signoff_prebill`: Authoritative sign-off and clearance of scrubbed pre-bill claims.
- [x] Mapped new permissions across key roles:
  - `CFO` / `Super Admin`: Full completeness, override, and signoff access.
  - `Biller`: View completeness and pre-bill signoff.
  - `Coder`: View completeness and pre-bill signoff.
- [x] Exported `getPermissionsCatalog()` helper to ensure testability and UI introspection.

---

## 4. Client Service Layer (`src/lib/supabase.js`) [COMPLETED]
- [x] **Charge Completeness RPC Wrappers**:
  - `evaluateChargeCompleteness(surgeryId)`: Executes database evaluation and returns run result.
  - `getLatestCompletenessRun(surgeryId)`: Retrieves latest audit run for an encounter.
  - `getCompletenessFindings(runId)`: Fetches granular findings with override metadata.
  - `overrideCompletenessFinding(findingId, reason)`: Validates mandatory reason, user identity, and updates finding status.
  - `clearCompletenessRun(runId, notes)`: Validates clearance criteria (0 active blockers) and records authoritative sign-off.
- [x] **Itemized Devices CRUD**:
  - `getCaseDevices(surgeryId)`: Queries itemized implants and hardware for a case.
  - `addCaseDevice(deviceData)`: Inserts itemized implant record.
  - `updateCaseDevice(deviceId, updates)`: Updates implant/device record.
  - `deleteCaseDevice(deviceId)`: Safely deletes device line item.

---

## 5. Pre-Bill Review UI & Workflow Integration [COMPLETED]
- [x] **`src/components/PrebillCompletenessModal.jsx`**:
  - Dedicated modal providing comprehensive pre-bill completeness inspection.
  - Visual status banner: `CLEARED` (Emerald), `BLOCKED` (Rose), `OVERRIDDEN` (Amber).
  - Metrics cards: Total Findings, Critical Blockers, Warnings, Active Overrides.
  - Tabbed interface:
    1. **Rules & Findings**: Rule badges, severity, description, remediation guidelines, and override trigger.
    2. **Itemized Devices & Implants**: Summary table with C-Codes, serial numbers, quantities, costs, and charges.
  - **Administrative Override Dialog**: Enforces mandatory clinical/billing justification for blockers.
  - **Authoritative Pre-Bill Sign-Off**: Enabled only when 0 unresolved blockers exist.
- [x] **`src/components/SurgeryScheduler.jsx`**:
  - Added "Pre-Bill Completeness Review" action button with `ShieldCheck` icon.
  - Wired modal state and refresh triggers.

---

## 6. Automated Verification Test Suite (`tests/charge-completeness-engine.test.js`) [COMPLETED]
- [x] **Domain 1: Database Migration 023 Integrity & Schema Constraints (6 tests)**:
  - Validates `case_devices`, `charge_completeness_runs`, `charge_completeness_findings` DDL.
  - Verifies zero-procedure fix in `fn_validate_case_procedures` returning `can_approve = false` and `PROC-001`.
  - Verifies stored procedure `fn_evaluate_charge_completeness` evaluates all 12 deterministic rules.
  - Verifies RLS policies and down rollback script.
- [x] **Domain 2: Financial Engine Reimbursement vs Gross Margin Integrity (2 tests)**:
  - Validates line 93 fix ensuring allowable reimbursement is not overwritten by gross charge.
  - Verifies multi-procedure 150% bilateral calculations.
- [x] **Domain 3: RBAC Permissions & Authorization Matrix (4 tests)**:
  - Validates catalog inclusion of `billing.view_completeness`, `billing.override_blocker`, and `billing.signoff_prebill`.
  - Verifies role assignment across CFO, Biller, Coder, and clinical roles.
- [x] **Domain 4: Client Service Layer & Pre-Bill Clearance Logic (4 tests)**:
  - Validates `evaluateChargeCompleteness`, `getCaseDevices`, `addCaseDevice`, and `deleteCaseDevice`.
  - Verifies `overrideCompletenessFinding` rejects empty reasons.
  - Verifies `clearCompletenessRun` blocks sign-off if unoverridden blockers persist.
- [x] **Domain 5: Pre-Bill Review UI Architecture & Integration (2 tests)**:
  - Validates `PrebillCompletenessModal.jsx` structure and zero-mock implementation.
  - Verifies `SurgeryScheduler.jsx` integration with pre-bill review triggers.

---

## 7. Quality Gate Status
- [x] `node --test tests/charge-completeness-engine.test.js`: 18/18 tests pass.
- [x] `npm test`: 477/477 tests pass across 100 test suites.
- [x] `npm run lint`: 0 errors.
