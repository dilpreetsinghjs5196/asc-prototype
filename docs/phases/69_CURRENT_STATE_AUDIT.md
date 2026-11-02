# PHASE 69 — CURRENT-STATE REPOSITORY & DATABASE AUDIT
## Comprehensive Inventory of Calculation Engines, Source Data Structures, and Provenance Gaps

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** READ-ONLY CURRENT-STATE AUDIT  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Financial Systems Architect, PostgreSQL Specialist  

---

## 1. COMPONENT-BY-COMPONENT AUDIT INVENTORY

The following matrix audits every existing repository component, SQL migration, stored procedure, and client service involved in reimbursement adjudication, classifying each as **KEEP**, **REFACTOR**, **REPLACE**, **MISSING**, or **NOT VERIFIED**:

| Component Name | Physical Location | Inputs | Outputs | Effective-Date & Version Behavior | Audit Classification | Architectural Evaluation & Gaps |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Core Multi-Tenancy** | `001_core_tenancy.sql`, `facilities`, `organizations` | `user_id` | Accessible tenant IDs | Permanent; no versioning. | **`[KEEP]`** | High security integrity. Canonical functions `is_facility_accessible()` must be preserved. |
| **CPT Code Versions** | `017_cpt_master_and_code_year_normalization.sql` | `cpt_code`, `year` | CPT description, status | Partitioned by release year (`cpt_release_years`). No mid-year quarterly versioning. | **`[REFACTOR]`** | Useful foundation, but lacks external publisher metadata, file checksums, and CMS quarterly addenda links. |
| **CPT Import Staging** | `017` (`cpt_import_batches`, `cpt_import_staging`) | CSV/File upload | Staged CPT codes | Batched by import job. Lacks executive approval workflow. | **`[REFACTOR]`** | Ad-hoc per CPT; should be unified under central `reimbursement_sources`. |
| **Medicare Base Rates** | `036_medicare_asc_base_rate_engine.sql` | `cpt_code`, `cbsa_code` | Baseline rate | Filtered by effective year. Lacks CMS quarterly Addenda release provenance. | **`[REFACTOR]`** | Math is sound (`0.50 * wage_index + 0.50`), but source file origin is not cryptographically recorded. |
| **CBSA Wage Index** | `036` (`medicare_wage_indices`) | `cbsa_code`, `year` | Wage index factor | Annual effective year. No publication date vs effective date separation. | **`[REFACTOR]`** | Must link to authoritative CMS Final Rule dataset ID and file checksum. |
| **Device Payment Rules**| `039_device_intensive_payment_rules.sql` | `cpt_code` | Payment Indicator (J8), device offset % | Effective date range on crosswalk. | **`[KEEP]`** | Good baseline. J8 device offset logic operates deterministically. |
| **Payer Contracts** | `041_payer_master.sql`, `042_payer_contract_model.sql` | `payer_id`, `facility_id` | Approved contract version | Effective-dated (`effective_date`, `expiration_date`). Version lock supported. | **`[KEEP]`** | Excellent architecture in Phase 66. Must be used as primary contract version reference. |
| **Rate Schedules & CPT Rates** | `043_payer_contract_rate_rules.sql` [PENDING] | `cpt_code`, `contract_version_id` | Contracted CPT fee, case rates | Effective-dated to contract version. | **`[REFACTOR]`** | Pending formal approval. Lacks raw fee schedule file upload checksums and source document IDs. |
| **Expected Reimbursement Engine** | `044_expected_reimbursement_engine.sql` [PROPOSED] | `surgery_id`, `contract_version_id` | Adjudication header, lines, adjustments | Effective-dated by DOS matching contract version. | **`[REFACTOR]`** | Unauthorized migration. Hashing is header-only; recalculation updates historical row in place. |
| **Central Source Registry** | *Does Not Exist* | — | — | — | **`[MISSING]`** | **Critical Gap:** No table tracks external datasets (CMS Addenda, AMA CPT, Payer Fee Schedules) with checksums. |
| **Central Source Version Registry** | *Does Not Exist* | — | — | — | **`[MISSING]`** | **Critical Gap:** No table tracks publication dates, effective date ranges, and approval status for external files. |
| **Unapplied Rule Trace** | *Does Not Exist* | — | — | — | **`[MISSING]`** | System records what triggered, but cannot explain why a rule was bypassed (e.g. why stop-loss was not met). |
| **reimbursementEngineService.js** | `src/lib/reimbursementEngineService.js` | `surgeryId`, options | JSON calculation snapshot | Client wrapper around PostgreSQL RPCs with fallback simulation. | **`[REFACTOR]`** | Fallback client-side calculation risks drifting from PostgreSQL stored procedure math. |
| **ReimbursementInspectorModal.jsx** | `src/components/ReimbursementInspectorModal.jsx` | `isOpen`, `surgeryId` | Interactive modal drill-down | Displays server snapshot; supports manual test inputs. | **`[KEEP]`** | Clean UX; verified compliant with Maestro Purple Ban. Needs tabs for source provenance. |

---

## 2. SOURCE DATA INVENTORY AUDIT

Our audit examined whether existing tables record critical provenance attributes for external datasets:

| Provenance Attribute | CPT Master (`017`) | Medicare ASC (`036`) | Payer Contracts (`042`) | Commercial Rates (`043` - Pending) | Phase 69 Target Requirement |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Source Name & Code** | ❌ (Implicit) | ❌ (Implicit) | ✅ (`contract_title`) | ❌ (Implicit) | **MANDATORY** (`reimbursement_sources`) |
| **Originating Publisher** | ❌ None | ❌ None | ✅ (`payer_master.payer_name`)| ❌ None | **MANDATORY** (e.g. `CMS`, `AMA`, `BCBS`) |
| **External Document ID** | ❌ None | ❌ None | ✅ (`payer_contract_documents`) | ❌ None | **MANDATORY** (e.g. `CMS-1786-FC`) |
| **Source Release / Version** | ⚠️ (`year` only) | ⚠️ (`effective_year`)| ✅ (`version_number`) | ⚠️ (`rate_schedule_code`) | **MANDATORY** (e.g. `2026-Q1-V1`) |
| **Publication Date** | ❌ None | ❌ None | ❌ None | ❌ None | **MANDATORY** (CMS Final Rule date) |
| **Effective Start & End Dates** | ⚠️ (Year only) | ⚠️ (Year only) | ✅ (`effective_date`, `expiration_date`) | ⚠️ (Inherits contract) | **MANDATORY** (Day-level precision) |
| **Original File Checksum** | ❌ None | ❌ None | ❌ (Doc storage only) | ❌ None | **MANDATORY** (SHA-256 of uploaded raw file)|
| **Import Job & Importer ID** | ✅ (`import_batches`)| ✅ (`import_batches`)| ✅ (`created_by`) | ✅ (`import_batches`) | **MANDATORY** (Unified import tracking) |
| **Executive Approval Status** | ❌ None | ❌ None | ✅ (`payer_contract_approvals`) | ❌ None | **MANDATORY** (`DRAFT`, `APPROVED`, `ACTIVE`)|

---

## 3. AUDIT OF CLIENT-SIDE FINANCIAL CALCULATIONS

A critical audit requirement is ensuring that client-side JavaScript never serves as the authoritative source of financial truth.

### Audit Findings:
1. **`reimbursementEngineService.js` (Lines 48–110):** Contains a fallback client-side calculation method `getDefaultCalculation(surgeryId)`.
   - *Risk:* If Supabase RPC is offline or unmigrated, the client computes `$3,200.00 + $900.00 = $4,100.00` using hardcoded math.
   - *Audit Directive:* Client-side calculation must be explicitly labeled `SIMULATED_MOCK_DATA` and flagged with status `UNVERIFIED_CLIENT_ESTIMATE`. It must **never** be written to the database or presented as an authoritative settlement ledger.
2. **`ReimbursementInspectorModal.jsx` (Lines 111–125):** Allows users to enter test patient liability overrides (copay, deductible, coinsurance).
   - *Integrity Verification:* When submitted, these inputs are passed as parameters to the server-side RPC `fn_calculate_expected_reimbursement`, which executes authoritative recalculation inside PostgreSQL. This preserves server-side calculation authority.
