# 47 CLAIM SCRUBBING RULES SPECIFICATION — ASCANALYST PLATFORM

**Document Version:** 1.0.0  
**Phase:** 47 — Pre-Bill Claim-Line Validation, Deterministic Edits & Clearinghouse Claim Scrubbing Rules Engine  
**Status:** SPECIFICATION COMPLETE — AWAITING REVIEW & GO/NO-GO DECISION  
**Target Architecture:** Multi-Tenant Ambulatory Surgery Center (ASC) Enterprise Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit Completed:** 2026-10-23  
**Implementation Mode:** READ-ONLY AUDIT & SPECIFICATION (NO CODE MUTATION BEFORE REVIEW)  
**Upstream Dependencies:** Phase 40 (`cpt_master`), Phase 41 (`cms_asc_coverage_and_payment`), Phase 44 (`cpt_billing_rules`, `cpt_modifiers_units_laterality`), Phase 45 (`cpt_versioning_and_licensed_content`), Phase 46 (`case_devices`, `charge_completeness_runs`), Phase 10 (`surgery_procedures`, 1NF line items)  

---

## 1. Executive Summary & Production Requirements

### 1.1 Purpose & Scope
In Ambulatory Surgery Center (ASC) revenue cycle management, claim scrubbing represents the critical gateway between clinical documentation and electronic claim submission (EDI 837P / CMS-1500 / 837I). While Phase 46 (**Charge Completeness Engine**) verified that an encounter is clinically complete (all procedures, devices, and operative notes are present), Phase 47 (**Claim Scrubbing Rules**) executes deterministic, line-level claim scrubbing against statutory clearinghouse, payer, and CMS rules to ensure **First-Pass Clean Claim Acceptance (>98%)**.

Phase 47 governs:
1. **EDI Demographic & Header Syntax Scrubbing:** Validating required HIPAA 5010 837P header elements (Patient DOB, gender, subscriber ID, billing NPI, rendering NPI, facility NPI, POS 24, Tax ID, Payer ID).
2. **NCCI Procedure-to-Procedure (PTP) Edits:** Enforcing CMS National Correct Coding Initiative Column 1 / Column 2 code bundling and validating appropriate unbundling modifiers (`59`, `XE`, `XS`, `XP`, `XU`).
3. **Payer-Specific & Contractual Rules:** Timely filing limits, prior authorization linkage, ASC coverage confirmation (`is_asc_covered`), and primary vs. secondary payer coordination.
4. **Deterministic Line-Level Edits:** Distinguishing between:
   - **Validation Finding:** Detected compliance error or warning.
   - **Proposed Edit:** Deterministic recommendation (e.g. sequence primary high-dollar code to Line 1, auto-append modifier 59/XS, populate POS 24).
   - **Applied Edit:** Tracked mutation applied to claim lines with before/after state diffs.
   - **Administrative Override:** Justified administrative override of non-EDI hard fatal errors.
   - **Final Approval:** Authorized release of clean claim for EDI transmission.

### 1.2 Boundary Separation: Phase 46 vs Phase 47

To prevent overlapping rules, redundant calculations, or conflicting clearance states, a strict lifecycle boundary is enforced:

| Dimension | Phase 46: Charge Completeness Engine | Phase 47: Claim Scrubbing Rules |
| :--- | :--- | :--- |
| **Operational Stage** | Post-Op / Pre-Billing Review | Billing / Pre-Submission Clearinghouse Scrub |
| **Primary Entity** | Encounter / Case (`public.surgeries`) | Formal Claim & Service Lines (`public.claims`, `public.claim_lines`) |
| **Core Question** | *"Are all clinical charges and notes documented?"* | *"Will this claim pass payer/clearinghouse edits without rejection?"* |
| **Evaluation Scope** | Gross procedures, operative notes, itemized devices | EDI 837 loops, NCCI PTP edits, NPIs, Tax IDs, Diagnosis Pointers |
| **Output / State** | `charge_completeness_runs.clearance_status` (`CLEARED`, `BLOCKED`, `OVERRIDDEN`) | `claims.scrub_status` (`UNSCRUBBED`, `SCRUB_FAILED`, `SCRUB_PASSED`, `OVERRIDDEN`, `READY_FOR_SUBMISSION`, `SUBMITTED`) |

---

## 2. Current-State Inventory & Component Classification

Every relevant component, table, service, and file across the repository and database was audited and classified as **KEEP**, **REFACTOR**, **REPLACE**, or **MISSING**.

### 2.1 Component Matrix

| Subsystem / Layer | Component / File / Object | Current Behavior & Verified State | Classification | Target Production Requirement |
| :--- | :--- | :--- | :---: | :--- |
| **Database Table** | `public.surgeries` (Migration 009) | Case master. Tracks `status` (`Draft` through `Billed`), `facility_id`, `primary_payer_id`, diagnoses. | **KEEP** | Retain as clinical encounter parent. Link to 1:M `public.claims`. |
| **Database Table** | `public.surgery_procedures` (Migration 010/022) | 1NF procedure lines. Snapshots `cpt_version_id`, `units`, `modifiers`, `pricing_dos`. | **KEEP / LINK** | Source for generating itemized `claim_lines`. Must retain snapshot rates. |
| **Database Table** | `public.case_devices` (Migration 023) | Itemized implants with `hcpcs_c_code`, serials, lot numbers, costs, charges. | **KEEP / LINK** | Source for itemized hardware claim lines (HCPCS C-codes). |
| **Database Table** | `public.patients` (Migration 012) | Patient master with MRN, DOB, gender, phone, email, `primary_payer_id`. | **KEEP** | Enforce non-null subscriber ID and valid demographic format during scrubbing. |
| **Database Table** | `public.facilities` (Migration 001/008) | Stores facility `tax_id`, `npi`, `settings` JSONB. | **KEEP / HARDEN** | Verify billing NPI (Box 33a) and EIN (Box 25) during scrubbing. |
| **Database Table** | `public.surgeons` (Migration 013) | Master identity with 10-digit NPI check constraint. | **KEEP** | Verify rendering provider NPI (Box 24j) and operating provider NPI. |
| **Database Table** | `public.payers` (Migration 002) | Stores `name`, `payer_type`, `payer_code` (electronic Payer ID). | **KEEP** | Enforce non-null `payer_code` for electronic 837P transmission. |
| **Database Table** | `public.cpt_billing_rules` (Migration 021) | Stores bilateral indicators, MUE limits, allowed modifiers. | **KEEP** | Query during line scrubbing for MUE and modifier validation. |
| **Database Table** | `public.cpt_modifier_conflicts` (Migration 021) | Pairwise incompatible modifier matrix (`RT`/`LT`, `50`/`RT`, `73`/`74`). | **KEEP** | Enforce mutually exclusive modifier detection on claim lines. |
| **Database Table** | `public.claims` | **Does not exist.** Surgeries currently jump from `Completed` to `Billed` without a formal claim table. | **MISSING** | Create `public.claims` table to manage 837P/CMS-1500 lifecycle and clearance. |
| **Database Table** | `public.claim_lines` | **Does not exist.** Service lines only exist as raw clinical `surgery_procedures`. | **MISSING** | Create `public.claim_lines` table tracking line-level charges, modifiers, diagnosis pointers, and line scrub status. |
| **Database Table** | `public.claim_scrub_runs` | **Does not exist.** No audit run logging for claim scrubbing. | **MISSING** | Create `public.claim_scrub_runs` tracking scrubber execution and clean-claim rates. |
| **Database Table** | `public.claim_scrub_findings` | **Does not exist.** No granular claim scrub error logging. | **MISSING** | Create `public.claim_scrub_findings` with EDI loop, line reference, severity, and remediation. |
| **Database Table** | `public.claim_scrub_edits` | **Does not exist.** No tracking of proposed vs applied automated claim fixes. | **MISSING** | Create `public.claim_scrub_edits` capturing automated edits, state diffs, and approvers. |
| **Database Table** | `public.ncci_ptp_edits` | **Does not exist.** CMS PTP Column 1 / Column 2 unbundling edits are not persisted. | **MISSING** | Create `public.ncci_ptp_edits` table with modifier indicators (0 = unbundling forbidden, 1 = modifier allowed, 9 = deleted). |
| **Client Service** | `src/lib/supabase.js` | Exposes case completeness and procedure methods; lacks claim scrubbing RPCs. | **REFACTOR** | Add `generateClaimFromEncounter`, `scrubClaim`, `applyClaimEdit`, `overrideClaimFinding`, `approveCleanClaim`. |
| **Client Helper** | `src/utils/hospitalUtils.js` | Has client-side `validateProcedureLineClient`. Client-side only. | **KEEP / COMPLEMENT** | Retain for real-time form feedback; server-side stored procedure is authoritative. |
| **Autonomous Agent** | `src/agents/billing/BillingAgent.js` | 21-line stub returning hardcoded `{ billedAmount: 1200 }`. | **REFACTOR** | Connect to authoritative claim scrubbing engine instead of returning mock payloads. |
| **RBAC Service** | `src/lib/rbacService.js` | Has `billing.view_completeness`, `billing.override_blocker`. Lacks claim scrub permissions. | **REFACTOR** | Add `claims.view_scrub`, `claims.run_scrubber`, `claims.apply_edits`, `claims.override_error`, `claims.approve_claim`. |

---

## 3. Data Model & Target Database Schema (Migration 024)

### 3.1 Relational Architecture Diagram

```
       ┌────────────────────────┐
       │   public.surgeries     │
       └───────────┬────────────┘
                   │ 1:M
                   ▼
       ┌────────────────────────┐         1:M        ┌────────────────────────┐
       │     public.claims      │───────────────────▶│   public.claim_lines   │
       └───────────┬────────────┘                    └────────────────────────┘
                   │ 1:M                                         │ 1:M
                   ▼                                             ▼
       ┌────────────────────────┐                    ┌────────────────────────┐
       │ public.claim_scrub_runs│                    │public.claim_scrub_edits│
       └───────────┬────────────┘                    └────────────────────────┘
                   │ 1:M
                   ▼
       ┌────────────────────────────┐
       │public.claim_scrub_findings │
       └────────────────────────────┘
```

### 3.2 Target Schema Definition

#### 1. `public.claims` (Formal Billing Claim Header)
```sql
CREATE TABLE IF NOT EXISTS public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    primary_payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE RESTRICT,
    secondary_payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL,
    claim_type VARCHAR(20) NOT NULL DEFAULT 'PROFESSIONAL' 
        CHECK (claim_type IN ('PROFESSIONAL', 'INSTITUTIONAL')), -- 837P vs 837I
    claim_frequency_type VARCHAR(5) NOT NULL DEFAULT '1' 
        CHECK (claim_frequency_type IN ('1', '7', '8')), -- 1=Original, 7=Replacement, 8=Void
    original_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    
    -- Billing Identifiers
    patient_control_number VARCHAR(50) NOT NULL, -- Box 26 / Loop 2300 CLM01
    prior_auth_number VARCHAR(50),               -- Box 23 / Loop 2300 REF*G1
    total_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_gross_charge >= 0),
    total_expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_expected_reimbursement >= 0),
    
    -- Provider & Facility Identifiers (Snapshotted for Provenance)
    billing_provider_npi VARCHAR(10) NOT NULL CHECK (billing_provider_npi ~ '^[0-9]{10}$'),
    billing_provider_tax_id VARCHAR(20) NOT NULL,
    rendering_provider_npi VARCHAR(10) NOT NULL CHECK (rendering_provider_npi ~ '^[0-9]{10}$'),
    operating_provider_npi VARCHAR(10) CHECK (operating_provider_npi IS NULL OR operating_provider_npi ~ '^[0-9]{10}$'),
    place_of_service VARCHAR(2) NOT NULL DEFAULT '24' CHECK (place_of_service IN ('24', '11', '22')), -- 24=ASC
    
    -- Scrubbing State Machine
    scrub_status VARCHAR(25) NOT NULL DEFAULT 'UNSCRUBBED'
        CHECK (scrub_status IN ('UNSCRUBBED', 'SCRUBBING', 'SCRUB_FAILED', 'SCRUB_PASSED', 'OVERRIDDEN', 'READY_FOR_SUBMISSION', 'SUBMITTED')),
    fatal_error_count INT NOT NULL DEFAULT 0,
    warning_count INT NOT NULL DEFAULT 0,
    applied_edit_count INT NOT NULL DEFAULT 0,
    
    -- Approval & Submission Audit
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submission_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_patient_control_num UNIQUE (facility_id, patient_control_number)
);
```

#### 2. `public.claim_lines` (Itemized Claim Service Lines)
```sql
CREATE TABLE IF NOT EXISTS public.claim_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_number SMALLINT NOT NULL CHECK (line_number >= 1 AND line_number <= 50),
    surgery_procedure_id UUID REFERENCES public.surgery_procedures(id) ON DELETE SET NULL,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    
    -- Service Information
    date_of_service DATE NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_description VARCHAR(255),
    modifiers TEXT[] NOT NULL DEFAULT '{}',
    units NUMERIC(8, 2) NOT NULL DEFAULT 1.00 CHECK (units > 0),
    gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_charge >= 0),
    expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0),
    
    -- Diagnosis Pointers (ICD-10)
    diagnosis_pointers VARCHAR(4)[] NOT NULL DEFAULT '{"A"}', -- Points to primary diagnoses
    
    -- Line Scrubbing Status
    line_scrub_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (line_scrub_status IN ('PENDING', 'PASSED', 'FAILED', 'OVERRIDDEN', 'EDITED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_claim_line_seq UNIQUE (claim_id, line_number)
);
```

#### 3. `public.ncci_ptp_edits` (CMS Procedure-to-Procedure Bundling Table)
```sql
CREATE TABLE IF NOT EXISTS public.ncci_ptp_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    column_one_cpt VARCHAR(10) NOT NULL,
    column_two_cpt VARCHAR(10) NOT NULL,
    modifier_indicator SMALLINT NOT NULL CHECK (modifier_indicator IN (0, 1, 9)),
    -- 0: Not allowed under any circumstance (cannot unbundle)
    -- 1: Allowed with appropriate NCCI modifier (59, XE, XS, XP, XU)
    -- 9: Not applicable / edit deleted
    ptp_rationale VARCHAR(100),
    effective_date DATE NOT NULL DEFAULT '2020-01-01',
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ncci_ptp_pair UNIQUE (column_one_cpt, column_two_cpt, effective_date),
    CONSTRAINT chk_diff_ptp_codes CHECK (column_one_cpt <> column_two_cpt)
);
CREATE INDEX IF NOT EXISTS idx_ncci_ptp_lookup ON public.ncci_ptp_edits (column_one_cpt, column_two_cpt);
```

#### 4. `public.claim_scrub_runs` (Scrubber Audit Executions)
```sql
CREATE TABLE IF NOT EXISTS public.claim_scrub_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scrubbed_by UUID, -- NULL = Automated system job
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rules_evaluated_count INT NOT NULL DEFAULT 0,
    fatal_errors_count INT NOT NULL DEFAULT 0,
    warnings_count INT NOT NULL DEFAULT 0,
    proposed_edits_count INT NOT NULL DEFAULT 0,
    resulting_status VARCHAR(25) NOT NULL,
    execution_duration_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.00
);
```

#### 5. `public.claim_scrub_findings` (Granular Scrub Errors & Warnings)
```sql
CREATE TABLE IF NOT EXISTS public.claim_scrub_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scrub_run_id UUID NOT NULL REFERENCES public.claim_scrub_runs(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE CASCADE,
    rule_id VARCHAR(50) NOT NULL,
    rule_category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('FATAL', 'WARNING', 'INFO')),
    edi_loop_reference VARCHAR(50), -- e.g. '2300 CLM01', '2400 SV101', '2010AA NM109'
    finding_message TEXT NOT NULL,
    remediation_guidance TEXT NOT NULL,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    overridden_by UUID,
    overridden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 6. `public.claim_scrub_edits` (Proposed & Applied Auto-Remediations)
```sql
CREATE TABLE IF NOT EXISTS public.claim_scrub_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE CASCADE,
    rule_id VARCHAR(50) NOT NULL,
    edit_action VARCHAR(50) NOT NULL, -- 'APPEND_MODIFIER', 'RESEQUENCE_LINES', 'SET_POS', 'CAP_UNITS'
    target_field VARCHAR(50) NOT NULL,
    original_value TEXT,
    proposed_value TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPLIED', 'REJECTED')),
    applied_by UUID,
    applied_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Deterministic Claim Scrubbing Rule Catalog

The engine evaluates 18 deterministic rules divided into 4 compliance domains:

### Domain A: EDI Syntax & Header Demographics (HIPAA 5010 837P)
- **`SCRUB-01` (Patient Identification):** Patient Subscriber ID is non-empty, alphanumeric, and conforms to payer format (Loop 2010BA NM109). *(Severity: FATAL)*
- **`SCRUB-02` (Patient Demographics):** Patient DOB is not in the future, gender is valid (`M`, `F`, `U`), and postal zip code conforms to 5 or 9-digit format (Loop 2010BA N403). *(Severity: FATAL)*
- **`SCRUB-03` (Billing Provider NPI):** Facility NPI is exactly 10 digits and passes the Luhn check algorithm (Loop 2010AA NM109). *(Severity: FATAL)*
- **`SCRUB-04` (Rendering Provider NPI):** Performing Surgeon NPI is exactly 10 digits, passes Luhn check, and is active (Loop 2310B NM109). *(Severity: FATAL)*
- **`SCRUB-05` (Federal Tax ID / EIN):** Facility Federal Tax ID is exactly 9 digits (Box 25 / Loop 2010AA REF*EI). *(Severity: FATAL)*
- **`SCRUB-06` (Place of Service 24):** Place of Service is strictly set to `24` (Ambulatory Surgical Center) for ASC institutional claims (Loop 2300 CLM05-1). *(Severity: FATAL / Proposed Edit: Auto-set to 24)*
- **`SCRUB-07` (Payer Identification):** Payer electronic identifier (`payer_code`) is present and valid for clearinghouse routing (Loop 2010BB NM109). *(Severity: FATAL)*

### Domain B: Clinical & NCCI Procedure-to-Procedure (PTP) Bundling
- **`SCRUB-08` (NCCI Column 1 / Column 2 Unbundling):** If Column 2 CPT is reported with Column 1 CPT on the same DOS and modifier indicator = `0`, unbundling is prohibited. *(Severity: FATAL)*
- **`SCRUB-09` (NCCI Modifier Required):** If Column 2 CPT is reported with Column 1 CPT and modifier indicator = `1`, an unbundling modifier (`59`, `XE`, `XS`, `XP`, `XU`) is mandatory. *(Severity: FATAL / Proposed Edit: Auto-recommend XS/59 if distinct anatomic site documented)*
- **`SCRUB-10` (Add-On Code Standalone Violation):** CPT codes flagged with `+` (e.g. `+29877`) cannot be billed without an allowable primary base procedure on the same claim. *(Severity: FATAL)*
- **`SCRUB-11` (Inherently Bilateral Modifier 50 Conflict):** CPT codes whose official descriptor is inherently bilateral cannot report Modifier `50`. *(Severity: FATAL / Proposed Edit: Remove modifier 50)*

### Domain C: Modifiers, Units & Laterality
- **`SCRUB-12` (Laterality Modifier Requirement):** Bilateral indicator = 1 procedures must report `50`, `LT`, or `RT`. Unilateral laterality without anatomical modifier triggers rejection. *(Severity: FATAL)*
- **`SCRUB-13` (Mutually Exclusive Modifiers):** Lines cannot contain incompatible modifier pairs (`RT`+`LT`, `50`+`RT`, `73`+`74`, `76`+`77`) defined in `cpt_modifier_conflicts`. *(Severity: FATAL)*
- **`SCRUB-14` (Maximum Modifier Capacity):** Service line contains > 4 modifiers (exceeds EDI 837P Loop 2400 SV101 capacity). *(Severity: FATAL)*
- **`SCRUB-15` (MUE Cap Exceeded):** Billed line units exceed the CMS Medically Unlikely Edit limit without clinical review. *(Severity: FATAL for MAI=2; WARNING for MAI=3)*

### Domain D: Timely Filing & Financial Governance
- **`SCRUB-16` (Timely Filing Boundary):** Claim age from Date of Service (`NOW() - date_of_service`) exceeds payer contract filing window (e.g. 90 days for Medicaid, 180 days for Commercial, 365 days for Medicare). *(Severity: FATAL / WARNING when within 15 days of expiration)*
- **`SCRUB-17` (Prior Authorization Missing):** Procedure requires payer prior authorization, but Box 23 / `prior_auth_number` is null. *(Severity: FATAL for commercial payers requiring pre-cert)*
- **`SCRUB-18` (MPPR Procedure Line Sequencing):** Highest allowable procedure line must be sequenced to Line 1 so Medicare and commercial payers calculate full 100% reimbursement on primary procedure. *(Severity: WARNING / Proposed Edit: Auto-resequence lines descending by allowable rate)*

---

## 5. Security, RBAC & Multi-Tenant RLS

### 5.1 RBAC Permission Catalog Updates (`src/lib/rbacService.js`)
Introduce 5 granular claim scrubbing permissions:
```javascript
// Claims & Scrubbing
{ code: 'claims.view_scrub', category: 'claims', name: 'View Claim Scrub Findings', risk_level: 'standard' },
{ code: 'claims.run_scrubber', category: 'claims', name: 'Execute Claim Scrubbing Engine', risk_level: 'standard' },
{ code: 'claims.apply_edits', category: 'claims', name: 'Apply Proposed Claim Edits', risk_level: 'sensitive' },
{ code: 'claims.override_error', category: 'claims', name: 'Override Claim Scrubbing Blocker', risk_level: 'critical' },
{ code: 'claims.approve_claim', category: 'claims', name: 'Approve & Release Clean Claim', risk_level: 'critical' },
{ code: 'claims.export_edi', category: 'claims', name: 'Generate & Export EDI 837P / 1500', risk_level: 'sensitive' }
```

### 5.2 Role Mapping Matrix

| Role | `view_scrub` | `run_scrubber` | `apply_edits` | `override_error` | `approve_claim` | `export_edi` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CFO / Finance** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Facility Admin**| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Biller / RCM**  | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Coder**         | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Surgeon**       | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Scheduler**     | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 6. Server-Side APIs & Stored Procedures

### 6.1 `fn_generate_claim_from_encounter(p_surgery_id BIGINT)`
- Validates that the encounter is `Completed` and has passed Phase 46 charge completeness (`clearance_status IN ('CLEARED', 'OVERRIDDEN')`).
- Automatically creates `public.claims` header and populates `public.claim_lines` from `public.surgery_procedures` and `public.case_devices`.
- Generates unique `patient_control_number` (e.g. `CLM-2026-000254-01`).

### 6.2 `fn_scrub_claim(p_claim_id UUID)`
- Runs in a transactional, isolated server-side environment.
- Evaluates all 18 deterministic rules against header and line items.
- Inserts audit record into `public.claim_scrub_runs` and granular findings into `public.claim_scrub_findings`.
- Generates automated remediation proposals in `public.claim_scrub_edits`.
- Updates `claims.scrub_status` to `SCRUB_PASSED` or `SCRUB_FAILED`.

### 6.3 `fn_apply_claim_edit(p_edit_id UUID, p_user_id UUID)`
- Validates caller authority (`claims.apply_edits`).
- Applies the proposed mutation to `claim_lines` or `claims` header.
- Records before/after state diff and updates edit status to `APPLIED`.
- Automatically re-scrubs the claim to verify issue resolution.

### 6.4 `fn_approve_clean_claim(p_claim_id UUID, p_user_id UUID)`
- Enforces zero active fatal errors (`fatal_error_count = 0` or all fatal errors have active overrides).
- Validates caller authority (`claims.approve_claim`).
- Locks claim from retroactive changes and sets status to `READY_FOR_SUBMISSION`.

---

## 7. UI / Workflow Requirements

### 7.1 Claim Scrubber Workbench (`ClaimScrubberWorkbench.jsx`)
- **Queue Views:**
  - `Failed Edits / Blocked Claims` (Priority queue).
  - `Ready for Approval` (Clean claims with 0 fatal errors).
  - `Approved / Ready for EDI Export`.
- **Claim Inspector Header:**
  - Status badge, Patient Control Number, Payer Name, Total Gross Charges, Expected Reimbursement.
  - Timely Filing Countdown badge (e.g. *"45 days remaining"*).
- **Interactive Line-Item Grid:**
  - Line number, Date of Service, CPT Code, Modifiers, Units, Charges, Diagnosis Pointers, Line Scrub Status.
- **Proposed Edits Panel:**
  - One-click **"Apply Proposed Edit"** button (e.g. "Auto-sequence lines for MPPR", "Attach Modifier XS").
- **Audit & Override Drawer:**
  - Mandatory justification text input with supervisor sign-off recording.

---

## 8. QA Test Cases & Acceptance Criteria

### 8.1 Verification Domains
1. **EDI Syntax Validation (Tests 1–4):** Verifies missing NPI, invalid Tax ID, non-ASC Place of Service, and invalid subscriber IDs fail closed.
2. **NCCI PTP Edits & Add-On Rules (Tests 5–8):** Verifies Column 1 / Column 2 unbundling blocks claims without modifier, and standalone add-on CPTs fail closed.
3. **Line-Item Sequencing & MPPR (Tests 9–11):** Verifies that line resequencing proposal orders charges descending by allowable rate.
4. **Proposed vs Applied Edits Audit (Tests 12–14):** Verifies state diffs, audit trails, and automatic re-scrubbing upon edit application.
5. **RBAC & Administrative Override (Tests 15–18):** Verifies Biller cannot override fatal errors without CFO approval, and unapproved claims cannot generate EDI.

### 8.2 Acceptance Criteria
- `npm test` passes 100% without mocks.
- `npm run lint` exits with 0 errors.
- Tenant isolation is strictly enforced via PostgreSQL RLS across all claim tables.
- Zero mock values in production paths.

---

## 9. Rollout Strategy & Migration Plan

### Step 1: Database Migration 024
- Deploy `024_claim_scrubbing_rules.sql` creating `claims`, `claim_lines`, `ncci_ptp_edits`, `claim_scrub_runs`, `claim_scrub_findings`, `claim_scrub_edits`, RLS policies, and stored procedures.
- Deploy `024_claim_scrubbing_rules_down.sql` for reversible rollback.

### Step 2: Seed NCCI PTP Baseline Edits
- Populate `public.ncci_ptp_edits` with authoritative CMS outpatient ASC PTP edits for core orthopedics, ophthalmology, endoscopy, and pain management procedures.

### Step 3: Client Service & RBAC Layer
- Expose claim scrubbing methods in `src/lib/supabase.js`.
- Register claim permissions and role mappings in `src/lib/rbacService.js`.

### Step 4: UI Scrubber Workbench
- Implement `ClaimScrubberWorkbench.jsx` and wire it into the `App.jsx` navigation hierarchy under **Billing & Claims**.

---

## 10. Prioritized Blockers & GO/NO-GO Recommendation

### 10.1 Identified Blockers & Risks

| ID | Severity | Risk Description | Remediation Plan |
| :---: | :---: | :--- | :--- |
| **BLK-01** | **P1** | **Missing Claim Header/Line Entity:** Encounters currently transition directly to `Billed` without a formal claim model. | Deploy `public.claims` and `public.claim_lines` in Migration 024. |
| **BLK-02** | **P1** | **Lack of NCCI PTP Table:** Unbundling edits cannot execute server-side without a normalized PTP database table. | Deploy `public.ncci_ptp_edits` seeded with CMS PTP quarterly files. |
| **BLK-03** | **P2** | **EDI 837P Formatter Gap:** Platform lacks an 837P ASCII generator for clearinghouse transmission. | Build standard HIPAA 5010 837P EDI generator in Phase 48 after scrubbing is certified. |

### 10.2 Final Recommendation: **GO (READY FOR IMPLEMENTATION)**
The read-only audit is complete. The architectural boundary between Phase 46 (Charge Completeness) and Phase 47 (Claim Scrubbing) is established with zero conflicting clearance states.

**Unresolved Questions for User Review:**
1. Should claim generation be triggered **automatically** upon Phase 46 pre-bill clearance, or should it remain a **manual biller action** in the UI?
2. Does your clearinghouse require **Professional (837P / CMS-1500)** only, or also **Institutional (837I / UB-04)** for ASC facility fees? (Default: Professional 837P with POS 24).
