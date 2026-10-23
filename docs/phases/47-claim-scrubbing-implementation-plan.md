# Phase 47 Implementation Plan & Production Report: Claim Scrubbing Rules & Pre-Bill EDI Clearinghouse

## 1. Executive Summary
Phase 47 establishes the **Deterministic Pre-Bill Claim Scrubbing Engine** for the ASC platform. It acts as an authoritative clearinghouse gateway that validates clinical documentation, billing identifiers, line-item CPT/HCPCS codes, NCCI Procedure-to-Procedure (PTP) edits, Medically Unlikely Edits (MUE), modifier completeness, and HIPAA 5010 837P syntax before any claim can be cleared or exported for submission.

---

## 2. Architecture & Data Model (Migration 024)

### 2.1 Database Entities (`supabase/migrations/024_claim_scrubbing_rules.sql`)
1. **`public.claims`**:
   - Primary claim header representing an 837P Professional or 837I Institutional billing claim.
   - Core fields: `patient_control_number` (Box 26 / Loop 2300 CLM01), `total_gross_charge`, `total_expected_reimbursement`, `billing_provider_npi`, `billing_provider_tax_id`, `rendering_provider_npi`, `place_of_service`, `scrub_status`, `fatal_error_count`, `warning_count`, `approved_by`, `approved_at`, `submitted_at`.
   - Scrub status state machine: `UNSCRUBBED` &rarr; `SCRUBBING` &rarr; `SCRUB_FAILED` / `SCRUB_PASSED` &rarr; `OVERRIDDEN` &rarr; `READY_FOR_SUBMISSION` &rarr; `SUBMITTED`.

2. **`public.claim_lines`**:
   - Itemized service lines linked to `claims.id`.
   - Fields: `line_number` (1–50), `cpt_code`, `procedure_description`, `modifiers` (`TEXT[]`), `units` (NUMERIC), `gross_charge`, `expected_reimbursement`, `diagnosis_pointers` (`VARCHAR(4)[]`), `line_scrub_status` (`PENDING`, `PASSED`, `FAILED`, `OVERRIDDEN`, `EDITED`).

3. **`public.ncci_ptp_edits`**:
   - CMS National Correct Coding Initiative (NCCI) Procedure-to-Procedure unbundling pairs.
   - Fields: `column_one_cpt`, `column_two_cpt`, `modifier_indicator` (0=never unbundle, 1=allowed with NCCI modifier 59/XE/XS/XP/XU, 9=deleted), `ptp_rationale`, `effective_date`.
   - Seeded with core ASC orthopedic, GI, and ophthalmic pairs (e.g. 29881/29877, 45385/45380, 66984/66982).

4. **`public.claim_scrub_runs`**:
   - Comprehensive audit log for each automated or manual scrubber execution.
   - Tracks `rules_evaluated_count`, `fatal_errors_count`, `warnings_count`, `proposed_edits_count`, `resulting_status`, `execution_duration_ms`.

5. **`public.claim_scrub_findings`**:
   - Granular violations identified during a scrub run.
   - Tracks `rule_id`, `rule_category`, `severity` (`FATAL`, `WARNING`, `INFO`), `edi_loop_reference`, `finding_message`, `remediation_guidance`, `is_overridden`, `override_reason`, `overridden_by`, `overridden_at`.

6. **`public.claim_scrub_edits`**:
   - Machine-proposed auto-remediations (e.g., adding POS 24, applying modifier 59, re-sequencing lines by highest allowable rate).
   - Tracks `rule_id`, `edit_action`, `target_field`, `original_value`, `proposed_value`, `status` (`PROPOSED`, `APPLIED`, `REJECTED`), `applied_by`, `applied_at`.

### 2.2 Reversible Rollback Script (`supabase/migrations/024_claim_scrubbing_rules_down.sql`)
- Drops stored procedures: `fn_approve_clean_claim`, `fn_override_claim_finding`, `fn_apply_claim_edit`, `fn_scrub_claim`, `fn_generate_claim_from_encounter`.
- Drops tables in strict reverse-dependency order: `claim_scrub_edits`, `claim_scrub_findings`, `claim_scrub_runs`, `ncci_ptp_edits`, `claim_lines`, `claims`.

---

## 3. The 18 Deterministic Scrubbing Rules Catalog

| Rule ID | Name | Category | Severity | EDI Loop / Box | Remediation / Proposed Edit |
|---------|------|----------|----------|----------------|-----------------------------|
| `SCRUB-01` | Patient Demographics Completeness | Demographic | FATAL | Loop 2010BA / Box 3, 5 | Validates patient name, DOB, and valid gender ('M', 'F', 'U'). |
| `SCRUB-02` | Primary Subscriber Policy ID | Payer | FATAL | Loop 2010BA NM109 / Box 1a | Enforces presence of non-empty subscriber/policy number. |
| `SCRUB-03` | Payer Electronic ID (Payer Code) | Payer | WARNING | Loop 2010BB NM109 | Verifies electronic clearinghouse payer identifier. |
| `SCRUB-04` | Billing Provider NPI (10-Digit) | Provider | FATAL | Loop 2010AA NM109 / Box 33a | Validates standard 10-digit numeric format. |
| `SCRUB-05` | Billing Provider Federal Tax ID / EIN | Provider | FATAL | Loop 2010AA REF02 / Box 25 | Verifies non-empty federal EIN or SSN. |
| `SCRUB-06` | Rendering Physician NPI | Provider | FATAL | Loop 2310B NM109 / Box 24j | Validates 10-digit surgeon NPI. |
| `SCRUB-07` | Place of Service Code (ASC POS 24) | Billing | WARNING | Loop 2300 CLM05-1 / Box 24b | Flags non-ASC POS and proposes auto-edit to POS '24'. |
| `SCRUB-08` | Primary ICD-10 Diagnosis Code | Clinical | FATAL | Loop 2300 HI01-2 / Box 21 | Checks for primary diagnosis pointer and format. |
| `SCRUB-09` | Zero-Line Claim Block | Clinical | FATAL | Loop 2400 / Box 24 | Blocks empty claims with 0 service lines. |
| `SCRUB-10` | Line Diagnosis Pointers | Clinical | FATAL | Loop 2400 SV107 / Box 24e | Verifies every line has at least 1 valid diagnosis pointer. |
| `SCRUB-11` | Zero-Dollar Service Charge | Financial | FATAL | Loop 2400 SV102 / Box 24f | Prevents claims with $0.00 line charge from submitting. |
| `SCRUB-12` | Medically Unlikely Edits (MUE) Units | CMS Coding | FATAL | Loop 2400 SV104 / Box 24g | Flags excessive units (e.g. cataract removal > 1 unit). |
| `SCRUB-13` | CMS NCCI Procedure-to-Procedure (PTP) | Compliance | FATAL | Loop 2400 / Box 24d | Evaluates bundled CPT pairs against `ncci_ptp_edits`. Proposes modifier 59/XS if indicator is 1, or blocks unbundling if indicator is 0. |
| `SCRUB-14` | Duplicate Service Line | Billing | FATAL | Loop 2400 / Box 24d | Detects identical CPT and modifiers on same date of service. |
| `SCRUB-15` | Future Date of Service | Temporal | FATAL | Loop 2400 DTP03 / Box 24a | Enforces Date of Service <= CURRENT_DATE. |
| `SCRUB-16` | Missing Prior Authorization | Regulatory | WARNING | Loop 2300 REF02 / Box 23 | Warns when commercial payers require pre-authorization. |
| `SCRUB-17` | Highest Rate Line Sequencing | Financial | WARNING | Loop 2400 / Box 24 | Proposes promoting highest allowable charge to Line 1 for optimal multiple procedure discounting (MPPR). |
| `SCRUB-18` | Timely Filing Limit (365 Days) | Regulatory | WARNING | Encounter Age | Flags claims with DOS older than 365 days. |

---

## 4. Stored Procedures & Business Logic

1. **`public.fn_generate_claim_from_encounter(p_surgery_id, p_user_id)`**:
   - Generates an authoritative claim header and itemized lines from an encounter.
   - Populates facility NPI, TIN, place of service 24, surgeon NPI, patient control number, and CPT charges.

2. **`public.fn_scrub_claim(p_claim_id, p_user_id)`**:
   - Evaluates all 18 deterministic scrubbing rules.
   - Creates a `claim_scrub_runs` record with execution duration in milliseconds.
   - Inserts findings into `claim_scrub_findings` and proposed auto-edits into `claim_scrub_edits`.
   - Sets `claims.scrub_status` to `SCRUB_PASSED` (if 0 fatal errors) or `SCRUB_FAILED`.

3. **`public.fn_apply_claim_edit(p_edit_id, p_user_id)`**:
   - Executes proposed modifications (e.g. setting POS to 24, appending modifier 59, or resequencing lines).
   - Marks the edit as `APPLIED` and automatically triggers a claim re-scrub.

4. **`public.fn_override_claim_finding(p_finding_id, p_reason, p_user_id)`**:
   - Records an auditable clinical or business justification for overriding a blocker.
   - Checks remaining un-overridden blockers; if 0 remain, updates `claims.scrub_status` to `OVERRIDDEN`.

5. **`public.fn_approve_clean_claim(p_claim_id, p_user_id)`**:
   - Verifies that zero unresolved fatal blockers exist.
   - Transitions `claims.scrub_status` to `READY_FOR_SUBMISSION`, locking the claim for EDI batch dispatch.

---

## 5. EDI 837P HIPAA 5010 Mapping

The client service method `db.exportClaimEDI(claimInput)` synthesizes standard ANSI X12 837P Professional format:
- **Envelope**: `ISA` (Interchange Control), `GS` (Functional Group `HC`), `ST` (`837*0001*005010X222A1`).
- **Beginning Segment**: `BHT` (0019 Submittal, Claim Reference).
- **Loop 1000A / 1000B**: Submitter and Receiver Name.
- **Loop 2000A / 2010AA**: Billing Provider Hierarchical Level & Name/NPI (`NM1*85*2*...`, `REF*EI*...`).
- **Loop 2000B / 2010BA**: Subscriber Hierarchical Level & Details (`NM1*IL*1*...`, `DMG*D8*...`).
- **Loop 2300**: Claim Header with Total Charge, POS 24, Prior Auth, and Primary ICD-10 diagnosis (`CLM*...`, `HI*BK:...`).
- **Loop 2400 / 2420A**: Service Lines with CPT, Modifiers, Units, Line Charge, DOS, and Operating Physician (`LX*...`, `SV1*HC:...`, `DTP*472*D8*...`, `NM1*82*1*...`).
- **Trailers**: `SE`, `GE`, `IEA`.

---

## 6. RBAC & Security Matrix (`src/lib/rbacService.js`)

| Permission Code | Description | CFO | Biller | Coder | Surgeon | Scheduler | Viewer |
|-----------------|-------------|:---:|:------:|:-----:|:-------:|:---------:|:------:|
| `claims.view_scrub` | View claim scrubber dashboard & findings | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `claims.run_scrubber` | Execute claim scrubbing rules on a claim | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `claims.apply_edits` | Apply automated recommended claim edits | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `claims.override_error` | Override fatal claim scrubbing blocker | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `claims.approve_claim` | Approve claim for clearinghouse dispatch | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `claims.export_edi` | Export HIPAA 5010 837P EDI data stream | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 7. Automated Test Suite Verification

- **Test Suite**: [tests/claim-scrubbing-rules.test.js](file:///e:/medicalAI/asc-prototype/tests/claim-scrubbing-rules.test.js)
- **Execution Command**: `node --test tests/claim-scrubbing-rules.test.js`
- **Results**: 20 tests across 5 domains; **20 passed (100% pass rate)**.
  1. Migration 024 DDL & Schema Integrity (8 tests) — PASSED
  2. EDI 837P HIPAA 5010 Compliance & Billing Agent (2 tests) — PASSED
  3. Client Service Layer API Contracts (5 tests) — PASSED
  4. RBAC & Claim Governance Security Matrix (3 tests) — PASSED
  5. UI Integration & Specification Compliance (2 tests) — PASSED

---

## 8. UI Workbench (`src/components/ClaimScrubberWorkbench.jsx`)

The Claim Scrubber Workbench features:
1. **Interactive Claim Queue**: Real-time filtering by status (`ALL`, `SCRUB_FAILED`, `SCRUB_PASSED`, `READY_FOR_SUBMISSION`) with patient, procedure, charge, and fatal error counters.
2. **One-Click Re-Scrub**: Dispatches real server-side stored procedure evaluation.
3. **Proposed Automated Edits Alert**: Highlights auto-remediations with one-click "Apply Edit" buttons that modify claim lines and automatically re-scrub.
4. **Itemized Claim Lines Table**: Details CPT, modifiers, units, gross charge, expected reimbursement, diagnosis pointers, and line-level scrub status badges.
5. **Detailed Findings Drawer**: Color-coded severity indicators (`FATAL` red, `WARNING` yellow, `INFO` blue) with remediation guidance and EDI loop references.
6. **Role-Gated Blocker Overrides**: Modal dialog requiring auditable written justifications for overriding fatal errors.
7. **HIPAA 5010 837P Stream Preview**: Modal with full EDI stream viewer and copy-to-clipboard functionality.
8. **App Navigation**: Integrated into [src/App.jsx](file:///e:/medicalAI/asc-prototype/src/App.jsx) under Clinical menu ("Claim Scrubbing & Edits") with header title mapping.
