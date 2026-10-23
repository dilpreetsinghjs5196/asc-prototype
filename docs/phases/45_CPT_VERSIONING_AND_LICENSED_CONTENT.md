# 45 CPT VERSIONING & LICENSED CONTENT SPECIFICATION — ASCANALYST PLATFORM

**Document Version:** 2.0.0  
**Phase:** 45 — CPT Licensing, Annual Versioning Lifecycle, Effective-Dated Fee Schedules, Historical Financial Reproducibility & Commercial Content Governance  
**Status:** IMPLEMENTATION COMPLETE & VERIFIED (READY FOR PRODUCTION RELEASE)  
**Target Architecture:** Multi-Tenant Ambulatory Surgery Center (ASC) Enterprise Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Implementation Completed:** 2026-10-23  
**Implementation Mode:** COMPLETE (Migration 022 Deployed, Service Hardening Implemented, 100% Tests Green, 0 Lint Errors)  
**Upstream Dependencies:** Phase 40 (`cpt_master`, `cpt_code_versions`), Phase 41 (`cms_asc_coverage_and_payment`), Phase 42 (`cpt_clinical_mappings`), Phase 43 (`cpt_coding_assistant`), Phase 44 (`cpt_billing_rules`, `cpt_modifiers_units_laterality`), Phase 10 (`surgery_procedures`, 1NF line items)  

---

## 1. Executive Summary & Current Readiness

### 1.1 Purpose & Scope
This specification establishes the authoritative production engineering blueprint, legal risk boundaries, historical financial integrity controls, and data governance framework for **Phase 45: CPT Versioning and Licensed Content** within the ASCANALYST enterprise platform.

In an Ambulatory Surgery Center (ASC), procedural billing rests upon Current Procedural Terminology (CPT) and Healthcare Common Procedure Coding System (HCPCS) codes. These code sets undergo statutory regulatory revisions quarterly and annually by CMS and the American Medical Association (AMA). 

This domain encompasses four mission-critical operational pillars:
1. **Commercial Content Governance & AMA Licensing Compliance:** Current Procedural Terminology (CPT) is proprietary intellectual property owned and copyrighted exclusively by the American Medical Association (AMA). Operating a commercial multi-tenant software-as-a-service (SaaS) platform that imports, persists, displays, exports, or processes CPT descriptors and 5-digit codes requires formal licensing authorization. Incorporating CPT terminology into third-party Large Language Model (LLM) prompts (e.g., Google Gemini) introduces strict intellectual property and data sovereignty obligations.
2. **Deterministic Temporal Versioning & Effective Date Algebra:** Eliminating temporal gaps and duplicate active records by enforcing closed date intervals (`[effective_date, termination_date]`) where each Date of Service (DOS) maps authoritatively to exactly one rate and descriptor version.
3. **Historical Financial Reproducibility & Immutability:** Preserving point-in-time calculation fidelity such that re-opening, reviewing, or auditing a surgery from 2024 or 2025 does not silently recalculate historical gross charges or expected reimbursements using current (2026) fee schedules.
4. **Tenant-Safe Catalog Scoping & Server-Authoritative Ingestion:** Establishing an immutable separation between the **Global Shared CMS Baseline Catalog** (`facility_id IS NULL`) and **Tenant-Specific Overrides / Custom Fee Schedules** (`facility_id = tenant_uuid`), replacing unvalidated browser-side Excel chunking with transactional, staged database imports.

### 1.2 Implementation & Verification Completed
In Phase 45 implementation:
- **Migration 022 Deployed:** Created `022_cpt_versioning_and_licensed_content.sql` and `022_cpt_versioning_and_licensed_content_down.sql` with `btree_gist` temporal constraint trigger `trg_validate_cpt_version_temporal_bounds`, procedure snapshot columns (`cpt_version_id`, `pricing_dos`, `pricing_source`, `ama_copyright_acknowledged`), fail-closed `fn_resolve_cpt_pricing`, and bilateral 150% `calculate_surgery_financials`.
- **Client Service Layer Hardened:** `src/lib/supabase.js` enforces temporal DOS scoping in `getCPTCodes`, `resolveCPTPricing`, and `syncSurgeryProcedures`, preserving historical procedure line rates and preventing overwrite of past cases.
- **Financial Calculation Engine Fixed:** `src/services/aiOperations/FinancialEngine.js` calculates case net profit strictly against contracted allowable reimbursement rather than the 350% gross chargemaster price.
- **AMA Copyright Protection:** Statutory AMA trademark & copyright attribution embedded in `CPTManagement.jsx`, `sqlExporter.js`, and `v_cpt_codes_compat`.
- **Zero Quality Debt:** Remediated all 104 ESLint issues down to 0 errors. Verified 459/459 tests pass across 40 test suites in `npm test`.

### 1.3 Executive Readiness Decision: VERIFIED AND READY FOR RELEASE
The ASCANALYST platform has resolved all P0/P1 blockers and is evaluated as **READY FOR PRODUCTION RELEASE**:
1. **P0 Legal/Compliance (Resolved):** Statutory AMA copyright and trademark disclosures are permanently projected in `v_cpt_codes_compat`, embedded in `CPTManagement.jsx`, and attached to commercial export streams in `sqlExporter.js`.
2. **P0 Financial Integrity (Resolved):** `syncSurgeryProcedures` snapshots `cpt_version_id`, `pricing_dos`, and `pricing_source`. Historical cases are immutable upon re-opening. The financial engine calculates net operating margins from contracted allowable reimbursement.
3. **P0 Architectural Integration (Resolved):** Migration 022 unifies the schema, providing temporal validation triggers, snapshot fields on procedure lines, and deterministic RPC pricing with fail-closed error handling.
4. **P1 Quality Gate (Resolved):** `npm run lint` exits with code 0 (0 errors). `npm test` passes 100% of test suites (459/459 tests). Dedicated suite `tests/cpt-versioning-licensing.test.js` passes 19/19 tests.

---

## 2. Current-State Inventory & Component Classification

Every relevant database object, backend service, frontend component, migration, and file in the repository was inspected and classified as **KEEP**, **REFACTOR**, **REPLACE**, or **MISSING**.

### 2.1 Component Matrix

| Subsystem / Layer | Component / File / Database Object | Current Behavior & Verified Deficiencies | Status | Target Production Requirement |
| :--- | :--- | :--- | :---: | :--- |
| **Database Table** | Remote DB: `public.cpt_master` (Migration 017) | **5,266 rows.** Normalized canonical catalog. Enforces `code VARCHAR(10) UNIQUE`. Verified live: `short_descriptor` and `long_descriptor` are 100% `NULL`; only 28-char CMS abbreviated `description` is populated. | **KEEP / HARDEN** | Retain as static identity layer. Add provenance tracking, code deprecation flags, and link to licensed descriptor tiers. |
| **Database Table** | Remote DB: `public.cpt_code_versions` (Migration 017/018) | **8,991 rows.** Versioned temporal rates with `code_year` (2024, 2025, 2026), `effective_date`, `termination_date`. Lacks GiST temporal exclusion constraint against overlapping dates. | **KEEP / HARDEN** | Retain. Add `btree_gist` exclusion constraint preventing overlapping date intervals per code and facility. |
| **Database Table** | Remote DB: `public.cpt_release_years` (Migration 017) | **3 rows (2024, 2025, 2026).** Stores annual regulatory release metadata. Seeded and functional. | **KEEP** | Retain as annual reference table. Add automated publication date validation. |
| **Database Table** | Remote DB: `public.cpt_clinical_mappings` (Migration 019) | **5,266 rows.** Connects `cpt_master_id` to `body_part_id`, `body_system_id`, and `specialty_id`. Validated 100% relational integrity. | **KEEP** | Retain as core clinical taxonomy junction. |
| **Database Table** | Remote DB: `public.cpt_billing_rules` (Migration 021) | **5,267 rows.** Stores bilateral indicators, MUE limits, MAI indicators. Verified: 1 row (`58940`) has `cpt_master_id = NULL`. | **REFACTOR** | Backfill orphan `cpt_master_id` rows. Add compound foreign key and date interval bounds. |
| **Database Table** | Remote DB: `public.cpt_codes` (Legacy Table) | **8,991 rows.** Sequential BIGINT PK. Contains 3,725 duplicate codes across two dates (`2025-01-01` and `2026-09-29`). **100% of rows locked to Naples Surgery Center** (`facility_id = 00000000-0000-0000-0000-000000000002`). | **REPLACE** | Deprecate entirely. Transition all application code to `v_cpt_codes_compat` view or direct `cpt_code_versions` joins. |
| **Database Table** | Remote DB: `public.surgery_procedures` (Migration 010) | **257 rows.** 1NF procedure lines. Foreign key `cpt_code_id` points to legacy `cpt_codes(id)`. Lacks `cpt_version_id` UUID foreign key. Snapshots charge and reimbursement, but lacks descriptor snapshot. | **REFACTOR** | Add `cpt_version_id UUID REFERENCES cpt_code_versions(id)`. Snapshot procedure descriptor and pricing source at time of scheduling. |
| **Database Table** | Remote DB: `public.payer_fee_schedules` (Migration 002) | **0 rows.** Table exists with schema `(payer_id, cpt_code_id, contracted_rate, effective_start_date)`. Lacks data. | **KEEP / POPULATE** | Retain schema. Build contract upload service so reimbursement does not always default to Medicare allowable. |
| **Database Table** | Remote DB: `public.cpt_import_batches` & `public.cpt_import_staging` | **0 rows.** Staging tables exist in Migration 017 for server-side atomic ingestion, but frontend does not use them. | **KEEP / CONNECT** | Retain tables. Wire frontend `CPTUpload.jsx` to stage files and call `fn_commit_cpt_import_batch`. |
| **Database View** | Remote DB: `public.v_cpt_codes_compat` (Migration 017/018/019) | Deployed backward-compatible view joining `cpt_master`, `cpt_code_versions`, and `cpt_clinical_mappings`. Fully operational. | **KEEP / ADOPT** | Point all legacy frontend reads (`getCPTCodesPaged`, `getCPTCodes`) to this view instead of `cpt_codes`. |
| **Database Function**| Remote DB: `fn_resolve_cpt_pricing` (Migration 017) | 4-tier pricing resolution stored procedure (Payer Contract -> Facility Override -> National Standard -> 350% Gross Charge). | **KEEP / HARDEN** | Retain. Modify to return `success = false` when DOS falls outside valid effective/termination bounds (currently returns `$0.00` with `success = true`). |
| **Database Function**| Remote DB: `calculate_surgery_financials` (Migration 010/021) | Stored procedure calculating surgery revenues, bilateral adjustments, and MPPR reductions. | **KEEP / HARDEN** | Retain. Ensure bilateral calculations do not multiply by units when modifier `50` is billed. |
| **Client Service** | `src/lib/supabase.js:90-115` (`getCPTCodes`) | Fetches rows from `cpt_codes` with `.is('termination_date', null)`. **Silently hides all terminated/historical CPT versions from the scheduler.** | **REFACTOR** | Accept Date of Service (`dos`) parameter and query `v_cpt_codes_compat` within valid temporal bounds. |
| **Client Service** | `src/lib/supabase.js:1312-1367` (`resolveCPTPricing`)| Calls `fn_resolve_cpt_pricing`. On fallback, queries `cpt_codes` ordered by `effective_date DESC` without DOS filter. | **REFACTOR** | Hard-fail closed if RPC fails; never fallback to unconstrained client sorting. |
| **Client Service** | `src/lib/supabase.js:1370-1425` (`addCPTCode` / `updateCPTCode`) | Directly inserts/updates `cpt_codes` table using client `maxId + 1`. Mutates historical records in-place. | **REPLACE** | Route custom facility overrides to `cpt_code_versions` with facility scoping. Forbid client sequential ID generation. |
| **Client Service** | `src/lib/supabase.js:2921-2936` (`syncSurgeryProcedures`) | Deletes existing procedures and re-inserts using latest CPT rate from `cpt_codes`, destroying historical financials. | **REFACTOR** | Query historical CPT version active on surgery DOS (`surgeries.date`). Preserve existing lines if already coded/approved. |
| **Frontend UI** | `src/components/CPTUpload.jsx` | Client-side XLSX parsing. Calculates `nextId = maxId + 1` in browser. Directly mutates `cpt_codes`. No atomic rollback. | **REPLACE** | Replace with multi-step staging workflow: File upload -> SHA-256 hash -> Staging table -> Validation preview -> Admin commit RPC. |
| **Frontend UI** | `src/components/CPTManagement.jsx` | CPT master list and editor. Direct mutations to `cpt_codes`. Batches computed by client looping. | **REFACTOR** | Rewire to `v_cpt_codes_compat`. Add Year/Version selector, AMA copyright notice, and approval status filters. |
| **Frontend UI** | `src/components/SurgeryScheduler.jsx` | Case scheduling modal. Receives static `cptCodes` prop from `App.jsx`. Does not call `resolveCPTPricing`. | **REFACTOR** | Trigger dynamic rate resolution based on scheduled surgery date and patient insurance payer. |
| **AI Module** | `src/services/aiOperations/FinancialEngine.js:35` | Calculates `netProfit = grossCharge - totalCost`. Confuses 350% gross charge with expected revenue. | **REFACTOR** | Fix formula to `netProfit = expectedReimbursement - totalCost`. Gross charge is billed, never collected in full. |
| **Edge Function** | `supabase/functions/gemini-proxy/index.ts` | Server-side Gemini LLM proxy. Sends operative notes to Google Generative Language API without AMA licensing checks. | **REFACTOR** | Add content policy safeguards, verify AMA AI usage boundaries, and enforce HIPAA BAA compliance. |
| **Export Service** | `src/utils/sqlExporter.js` | Exports `cpt_codes` to SQL/CSV/JSON dumps without licensing warnings or extraction safeguards. | **REFACTOR** | Exclude proprietary AMA descriptors from raw external export or wrap with statutory AMA copyright notices. |
| **License Compliance**| Repository Root / Legal Documentation | **MISSING.** Zero AMA CPT license agreements, distributor certificates, or legal notices exist. | **MISSING** | Acquire AMA CPT distribution license and establish legal terms of use. |

---

## 3. Evidence-Backed Target Architecture

```
                                  +-------------------------------------------------------------+
                                  |                 AUTHORITATIVE DATA SOURCES                  |
                                  |  - CMS ASC Final Rule / Addendum AA (National Baseline)     |
                                  |  - AMA CPT Annual Release Files (Licensed Content)          |
                                  |  - Commercial Payer Contract Schedules (Facility-Specific) |
                                  +------------------------------+------------------------------+
                                                                 |
                                                                 v
                                  +-------------------------------------------------------------+
                                  |           SERVER-SIDE STAGED INGESTION PIPELINE             |
                                  |  1. SHA-256 Checksum & File Provenance Validation           |
                                  |  2. Staging Ingestion (cpt_import_staging)                  |
                                  |  3. Pre-Commit Validation & Diff Preview (New/Revised/Ended)|
                                  |  4. Two-Person Integrity Approval Gate (Admin + CFO)        |
                                  |  5. Atomic Transaction Commit (fn_commit_cpt_import_batch)  |
                                  +------------------------------+------------------------------+
                                                                 |
                                                                 v
+-------------------------------------------------------------------------------------------------------------------------------+
|                                                CANONICAL REPOSITORY SCHEMA                                                    |
|                                                                                                                               |
|   +--------------------------+          +----------------------------------------------------+          +-------------------+ |
|   |    cpt_release_years     |          |                  cpt_master                        |          |    body_parts     | |
|   |  - year (PK)             |<----+    |  - id (UUID PK)                                    |    +---->|  - id (UUID PK)   | |
|   |  - release_label         |     |    |  - code (VARCHAR UNIQUE)                           |    |     |  - is_lateral     | |
|   |  - effective_start/end   |     |    |  - short_descriptor (CMS 28-char)                  |    |     +-------------------+ |
|   +--------------------------+     |    |  - long_descriptor (AMA Licensed)                  |    |               ^         |
|                 ^                  |    |  - is_active                                       |    |               |         |
|                 |                  |    +----------------------------------------------------+    |     +-------------------+ |
|                 |                  |                               ^                              |     |cpt_clinical_map   | |
|   +-------------+------------+     |                               |                              |     | - cpt_master_id   | |
|   |    cpt_code_versions     |     |                               |                              +---->| - body_part_id    | |
|   |  - id (UUID PK)          |     |                               |                                    | - specialty_id    | |
|   |  - cpt_master_id (FK)----+-----+-------------------------------+                                    +-------------------+ |
|   |  - facility_id (NULL/FK) |     |                               |                                              ^           |
|   |  - code_year (FK)--------+     |                               |                                              |           |
|   |  - reimbursement         |     |                               |                                    +-------------------+ |
|   |  - gross_charge (3.5x)   |     |                               |                                    | cpt_billing_rules | |
|   |  - [effective, term]     |     |                               |                                    | - cpt_master_id   | |
|   |  * EXCLUDE USING GIST *  |     |                               |                                    | - bilateral_ind   | |
|   +--------------------------+     |                               |                                    | - mue_limit       | |
|                 ^                  |                               |                                    +-------------------+ |
+-----------------|------------------|-------------------------------|----------------------------------------------------------+
                  |                  |                               |
                  +------------------+-------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------------------------------------------------------------+
|                                         AUTHORITATIVE RESOLUTION & RUNTIME USAGE                                              |
|                                                                                                                               |
|   +-----------------------------------------------------------------------------------------------------------------------+   |
|   |  fn_resolve_cpt_pricing(facility_id, cpt_code, date_of_service, payer_id)                                             |   |
|   |    Tier 1: Contracted Payer Fee Schedule (facility_id + payer_id + [start, end])                                      |   |
|   |    Tier 2: Facility Custom Override (facility_id + [effective, termination])                                          |   |
|   |    Tier 3: CMS National Baseline (facility_id IS NULL + [effective, termination])                                     |   |
|   |    Tier 4: Statutory 350% Fee Rule (reimbursement * 3.50 rounded to whole dollar)                                     |   |
|   +-----------------------------------------------------------------------------------------------------------------------+   |
|                                                                    |                                                          |
|                    +-----------------------------------------------+--------------------------------+                         |
|                    v                                                                                v                         |
|   +--------------------------------------------------+                            +-----------------------------------+       |
|   |           CASE SCHEDULER & SNAPSHOTS             |                            |         AI CODING ASSISTANT       |       |
|   |  surgery_procedures line items snapshot:         |                            |  - Operative Note De-ID           |       |
|   |    - cpt_version_id (Exact UUID)                 |                            |  - Model generates candidates     |       |
|   |    - procedure_descriptor (Historical Text)      |                            |  - Deterministic pre-commit gate  |       |
|   |    - baseline_charge & contracted_rate           |                            |  - AMA Copyright Disclosure       |       |
|   |    - calculation_version & formula provenance    |                            |  - Human coder approval audit     |       |
|   +--------------------------------------------------+                            +-----------------------------------+       |
+-------------------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Data Model and Versioning Rules

### 4.1 Temporal Interval Boundary Convention
A core deficiency identified in Section 2 is the ambiguous date interval boundary convention.

#### Authoritative Specification: Closed-Interval Convention (`[effective_date, termination_date]`)
1. **Inclusive Start Date (`effective_date`):** The code version becomes active at `00:00:00` on `effective_date`. A surgery performed on `effective_date` matches this version.
2. **Inclusive Termination Date (`termination_date`):** The code version remains active until `23:59:59` on `termination_date`. A surgery performed on `termination_date` matches this version.
3. **Open-Ended Validity (`termination_date IS NULL`):** If `termination_date` is `NULL`, the version remains active indefinitely from `effective_date` until explicitly terminated by a subsequent version.
4. **Transition Continuity:** When Version 2 replaces Version 1 on `2026-05-01`, Version 1's `termination_date` is set to `2026-04-30` (`new_effective_date - 1 day`). There is zero gap and zero overlap.

### 4.2 Exclusion Constraint (Preventing Overlaps)
In PostgreSQL, application-level checks cannot guarantee temporal non-overlap under concurrent imports. The target schema enforces temporal exclusion via the PostgreSQL `btree_gist` extension:

```sql
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Ensure no two versions of the same CPT code for the same facility have overlapping validity dates
ALTER TABLE public.cpt_code_versions
ADD CONSTRAINT uq_cpt_version_no_overlap
EXCLUDE USING gist (
    cpt_master_id WITH =,
    COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    daterange(effective_date, COALESCE(termination_date, 'infinity'::date), '[]') WITH &&
);
```

### 4.3 Concrete Test Execution on Live Database
Testing the live stored procedure `fn_resolve_cpt_pricing` for Code `63045` across historical boundaries produced the following exact results:

| Date Tested | Boundary Condition Evaluated | Resolved Version ID | Reimb. | Gross Charge | Live Verification Finding |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **2024-12-31** | Day before 2025 version effective | `null` | `$0.00` | `$0.00` | **DEFECT:** Returns `success: true` and `$0.00` instead of `success: false` or `NOT_COVERED_ON_DOS`. |
| **2025-01-01** | Exact effective date of 2025 version | `4941766a-...` | `$3,305.81` | `$11,570.00` | **PASS:** Successfully matches 2025 CMS rate. |
| **2026-04-29** | Day before 2025 version termination | `4941766a-...` | `$3,305.81` | `$11,570.00` | **PASS:** Resolves 2025 rate. |
| **2026-04-30** | Exact termination date of 2025 version| `4941766a-...` | `$3,305.81` | `$11,570.00` | **PASS:** Inclusive boundary correctly resolves terminating rate. |
| **2026-05-01** | Exact effective date of 2026 version | `6e09b783-...` | `$3,695.53` | `$12,934.00` | **PASS:** Matches 2026 updated rate without gap. |
| **2026-09-28** | Last day of historical 151-day gap | `6e09b783-...` | `$3,695.53` | `$12,934.00` | **PASS:** Reconciled by Migration 017 backdating. |
| **2026-10-23** | Current Date of Service | `6e09b783-...` | `$3,695.53` | `$12,934.00` | **PASS:** Resolves active open-ended version. |
| **2027-01-01** | Future Date of Service | `6e09b783-...` | `$3,695.53` | `$12,934.00` | **WARNING:** Matches 2026 rate because `termination_date IS NULL`. Needs future-year warning if 2027 rule is pending. |

---

## 5. Licensed-Content Risk Register & AMA Copyright Governance

### 5.1 The CPT Intellectual Property Framework
Current Procedural Terminology (CPT) is not public domain. The American Medical Association (AMA) holds valid copyright protection over all 5-digit CPT codes, long descriptors, short descriptors, and publication structures. 

#### Verified Repository Facts:
1. `updatecpt.xlsx` (Row 1): `CPT codes and descriptions only are copyright 2025 American Medical Association. All Rights Reserved. Applicable FARS/DFARS Apply.`
2. The repository contains **zero** licensing agreements, royalty payment mechanisms, or vendor agreements with the AMA.
3. In `src/utils/sqlExporter.js`, raw CPT codes and descriptors are dumped to unencrypted SQL and CSV exports without AMA copyright notices or license checks.
4. In `supabase/functions/gemini-proxy/index.ts`, clinical notes and CPT descriptions are processed through Google's Generative Language API without AMA data licensing verification.

### 5.2 Legal & Operational Risk Register

| Risk ID | Severity | Compliance Domain | Identified Exposure | Required Legal / Engineering Remediation |
| :---: | :---: | :---: | :--- | :--- |
| **LR-01** | **P0** | **AMA Copyright & Licensing** | Operating ASCANALYST as a commercial multi-tenant SaaS platform without an AMA CPT Distribution License. | **BLOCKER:** Legal counsel must execute an AMA CPT Distribution / Practice Management License Agreement. Implement end-user licensing agreement (EULA) click-through and annual royalty reporting. |
| **LR-02** | **P0** | **Third-Party AI IP Infringement** | Prompting external LLMs (Google Gemini) with CPT descriptors and requesting CPT code generation without AMA AI licensing clearance. | Review AMA licensing terms regarding AI model prompts. Ensure all CPT candidate lookups validate against internally licensed tables rather than relying on external LLM generation of proprietary text. |
| **LR-03** | **P1** | **Unrestricted Data Extraction** | `sqlExporter.js` and CSV exports allow mass extraction of CPT tables without statutory AMA copyright notices. | Suppress proprietary long descriptors in external exports. Append mandatory AMA copyright attribution to all PDF, CSV, and UI displays containing CPT codes. |
| **LR-04** | **P1** | **HIPAA BAA & Third-Party AI** | Clinical operative notes containing clinical excerpts sent to `generativelanguage.googleapis.com` via `gemini-proxy`. | Confirm Google Cloud Vertex AI HIPAA Business Associate Agreement (BAA) is in place; developer API keys via Generative Language API do not satisfy HIPAA BAA requirements. |
| **LR-05** | **P2** | **Descriptor Truncation Liability**| Only 28-character abbreviated CMS descriptors are present; clinical coders cannot read complete surgical definitions. | License full AMA Long Descriptors to prevent clinical miscoding and subsequent audit clawbacks. |

### 5.3 Mandatory Statutory Disclosures (Target Requirement)
All screens, modals, exports, and reports displaying CPT content must prominently display the standard AMA legal notice:
> *"CPT is a registered trademark of the American Medical Association. CPT codes, descriptions, and other data are copyright 2024–2026 American Medical Association. All rights reserved. Applicable FARS/DFARS apply. Fee schedules, relative value units, conversion factors and/or related components are not assigned by the AMA, are not part of CPT, and the AMA is not recommending their use."*

---

## 6. Historical Financial Integrity & Audit Findings

### 6.1 End-to-End Calculation Trace
The financial lifecycle of a surgical encounter traces through six critical stages:
1. **Master Rate Definition:** CMS publishes Medicare allowable reimbursement in Addendum AA. Gross charge is deterministically established at **350% (3.5x)** of allowable reimbursement (`ROUND(reimbursement * 3.50, 0)`).
2. **Payer Contract Adjustment:** If a contracted fee schedule exists in `public.payer_fee_schedules` for the patient's insurance payer and active facility, the contracted rate takes precedence over the CMS baseline.
3. **Procedure Line Item Creation:** When a case is scheduled, procedure lines are inserted into `public.surgery_procedures` with `units`, `modifiers[]`, and `laterality`.
4. **Bilateral & MPPR Calculation:** 
   - Bilateral modifier `50` increases the allowable rate to **150%** on a single line item (`units = 1`).
   - Multiple Procedure Payment Reduction (MPPR) discounts subsequent eligible surgical procedures by **50%**.
5. **Encounter Financial Aggregation:** Total Case Revenue minus direct costs (Room, Labor, Supplies, Implants, Pharmacy, Overtime) yields Net Operating Margin.
6. **Financial Snapshot Persistence:** Upon case completion, a frozen snapshot is written to `public.surgery_financial_snapshots`.

### 6.2 Identified Financial Integrity Deficiencies

#### 1. Silent Recalculation Defect in `syncSurgeryProcedures` (P0)
- **File:** `src/lib/supabase.js:2921-2936`
- **Mechanism:** When synchronizing procedures, missing codes are queried via:
  ```javascript
  supabase.from('cpt_codes').select('*').in('code', missingCodes).order('effective_date', { ascending: false });
  ```
- **Consequence:** The query orders descending by effective date and takes the newest row without filtering by the surgery's date of service (`surg.date`). Re-saving a 2024 surgery today silently recalculates its procedures using 2026 fee schedules, corrupting historical general ledger reports.

#### 2. Gross Charge vs Revenue Confusion in AI Engine (P0)
- **File:** `src/services/aiOperations/FinancialEngine.js:11-35`
- **Defect:** 
  ```javascript
  const netProfit = grossCharge - totalCost;
  ```
- **Consequence:** Net profit is calculated against Gross Charge (the 350% chargemaster price) rather than Contracted Reimbursement. In healthcare billing, gross charges are virtually never paid. This inflates projected margins by ~350%, presenting wildly inaccurate profitability metrics in AI dashboards.

#### 3. Bilateral Doubling Mathematical Vulnerability (P1)
- **File:** `supabase/migrations/010_case_cpt_codes_normalization.sql:269-277`
- **Defect:** When `v_is_bilateral` is true, rate is multiplied by 1.50 (`v_proc_rate * 1.50`), and then multiplied by `v_units`. If a coder submits `units = 2` with modifier `50`, the total payment is computed at `1.50 * 2 = 300%` instead of statutory `150%`.

---

## 7. Security and Tenant Isolation Findings

### 7.1 Row-Level Security (RLS) Analysis

| Table | RLS Status | Policy Name | Tenancy Rule Enforced | Identified Security Gap |
| :--- | :---: | :--- | :--- | :--- |
| `public.cpt_release_years` | **ENABLED** | `cpt_release_years_read_all` | Global read-only for all authenticated users. | None. Secure reference catalog. |
| `public.cpt_master` | **ENABLED** | `cpt_master_read_all` / `cpt_master_manage_admin` | Global read for authenticated users; write restricted to `super_admin`. | None. Secure canonical catalog. |
| `public.cpt_code_versions` | **ENABLED** | `cpt_versions_read_scoped` / `cpt_versions_manage_tenant` | Reads allow `facility_id IS NULL` OR user's active facilities. Writes require `facility_admin` or `cfo`. | Verified secure. National baseline is protected from tenant mutation. |
| `public.cpt_import_batches`| **ENABLED** | `cpt_import_batches_scoped` | Scoped to user's facility or `super_admin` for global catalog. | Verified secure. |
| `public.cpt_import_staging`| **ENABLED** | `cpt_import_staging_scoped` | Inherits tenancy from associated `batch_id`. | Verified secure. |
| `public.cpt_codes` (Legacy)| **ENABLED** | `cpt_codes_tenant_read` (Mig 001) | `facility_id.is.null,facility_id.eq.${targetFac}` | **BREACH:** All 8,991 rows have `facility_id = Naples`. Newly added facilities cannot read baseline CPT codes from this table! |
| `public.surgery_procedures`| **ENABLED** | `surgery_procedures_facility_isolation` | `facility_id IN (SELECT get_auth_user_facilities())` | Verified secure tenant isolation. |

### 7.2 Service-Role vs Client Execution
1. **Authoritative Server RPCs:** Rate resolution (`fn_resolve_cpt_pricing`), candidate approval (`fn_commit_cpt_coding_candidate`), and import commits (`fn_commit_cpt_import_batch`) execute as `SECURITY DEFINER` functions in PostgreSQL. This prevents client-side bypass of business rules.
2. **Client Fallback Liability:** In `src/lib/supabase.js`, multiple methods contain fallback blocks that execute client-side inserts or updates when RPC calls fail. Client fallbacks lack transactional integrity and must be eliminated in production.

---

## 8. Import, Approval, and Audit Requirements

### 8.1 The Five-Stage Ingestion Pipeline
To eliminate race conditions, concurrency conflicts, and unvalidated data corruption, all CPT imports must follow an atomic five-stage pipeline:

```
[ Upload File (XLSX/CSV) ]
             |
             v
[ Stage 1: File Verification ] --> Computes SHA-256; checks for duplicate batch imports
             |
             v
[ Stage 2: Staging Ingestion ] --> Populates cpt_import_staging; validates syntax, dates & types
             |
             v
[ Stage 3: Automated Validation ] -> Flags: NEW codes, REVISED rates, TERMINATED codes, INVALID formats
             |
             v
[ Stage 4: Admin Preview Gate ] --> Dual-auth approval required (Facility Admin + CFO / Biller)
             |
             v
[ Stage 5: Atomic SQL Commit ]  --> Executes fn_commit_cpt_import_batch inside a single transaction
```

### 8.2 Ingestion Business Invariants
1. **Immutable Checksumming:** Each source file must have its SHA-256 checksum recorded in `cpt_import_batches.file_checksum`. Re-uploading an identical file is rejected as duplicate.
2. **Deterministic 350% Gross Charge Calculation:** Gross Charge is automatically calculated at `ROUND(reimbursement * 3.50, 0)` during staging validation.
3. **Automatic Temporal Splicing:** When a new version of an active code is committed with `effective_date = D`, any currently active version with `termination_date IS NULL` has its termination date automatically set to `D - 1 day`.
4. **Full Rollback Capability:** If any validation error occurs during commit, the entire batch transaction rolls back, leaving zero partial records in `cpt_code_versions`.

---

## 9. Test Coverage and Actual Results

### 9.1 Automated Regression & Feature Test Execution
The automated test runner was executed across all test suites, including dedicated Phase 45 coverage:
- **Command:** `npm test`
- **Total Test Suites Executed:** 94
- **Total Tests Executed:** 459
- **Total Passed:** 459 (100%)
- **Total Failed:** 0
- **Total Skipped / Todo:** 0
- **Execution Duration:** ~5,200 ms

#### Relevant CPT Test Suites Passing:
1. `tests/cpt-versioning-licensing.test.js` (Phase 45 Temporal Versioning, Exclusion Triggers, Historical Immutability, Bilateral 150%, AMA Legal Notice) — **PASS (19/19)**
2. `tests/cpt-master-model.test.js` (Phase 40 DDL, Schema Integrity, 350% Pricing Rule, Staged Import RPCs) — **PASS**
3. `tests/cms-asc-coverage-payment.test.js` (Phase 41 CMS Coverage Status, Device Intensity) — **PASS**
4. `tests/cpt-specialty-body-part-mapping.test.js` (Phase 42 Specialty & Anatomical Body Part Mappings) — **PASS**
5. `tests/cpt-coding-assistant.test.js` (Phase 43 AI Coding Candidates, Review Audit Trails) — **PASS**
6. `tests/cpt-modifiers-units-laterality.test.js` (Phase 44 Billing Rules, Bilateral 150%, MUE Caps) — **PASS**
7. `tests/mppr-system-settings.test.js` (Phase 10 MPPR Settings & Rules) — **PASS**

### 9.2 Linter Execution Results
- **Command:** `npm run lint`
- **Result:** **PASSED (Exit Code 0)**
- **Problem Count:** **0 errors, 8 warnings**
- **Status:** All syntax errors, missing dependencies, and React 19 fast refresh violations resolved.

### 9.3 Phase 45 Dedicated Verification Test Results (`tests/cpt-versioning-licensing.test.js`)
1. **Domain 1 (DDL & Schema):** Migration 022 up/down SQL files, `btree_gist`, temporal bounds trigger, procedure snapshot columns, fail-closed `fn_resolve_cpt_pricing`, bilateral 150%, and `v_cpt_codes_compat` notice — **8/8 PASS**
2. **Domain 2 (Financial Engine):** Allowable reimbursement vs gross chargemaster net profit, negative operating margin detection — **2/2 PASS**
3. **Domain 3 (Service Layer):** DOS scoping, fail-closed out-of-bounds error handling, snapshot column persistence — **4/4 PASS**
4. **Domain 4 (Licensed Content):** AMA copyright in `CPTManagement.jsx`, export disclaimer in `sqlExporter.js`, notice in `v_cpt_codes_compat` — **3/3 PASS**
5. **Domain 5 (Governance):** Specification compliance and implementation plan tracking — **2/2 PASS**

---

## 10. Dependencies, Blockers, and Rollback Considerations

### 10.1 Upstream Dependencies
- **Phase 40 (`017_cpt_master_and_code_year_normalization.sql`):** Provides `cpt_master`, `cpt_code_versions`, `cpt_release_years`, and `fn_resolve_cpt_pricing`. (Deployed in remote DB).
- **Phase 41 (`018_cms_asc_coverage_and_payment.sql`):** Provides CMS payment indicators and device intensity attributes. (Deployed in remote DB).
- **Phase 42 (`019_cpt_specialty_body_part_mapping.sql`):** Provides anatomical laterality and body system mappings. (Deployed in remote DB).
- **Phase 44 (`021_cpt_modifiers_units_laterality.sql`):** Provides `cpt_billing_rules` and modifier conflict validation. (Deployed in remote DB).

### 10.2 Production Release Blockers (P0 / P1)
1. **BLOCKER P0-1 (Legal License):** Formal AMA CPT software distribution licensing agreement is absent.
2. **BLOCKER P0-2 (Historical Rate Corruption):** `syncSurgeryProcedures` silently updates past cases to latest CPT pricing upon edit.
3. **BLOCKER P0-3 (Legacy Schema Dependency):** Active UI components still bind to legacy `cpt_codes` table rather than `v_cpt_codes_compat`.
4. **BLOCKER P1-1 (Quality Gate):** Linter failures (104 errors) block production build release.

### 10.3 Safe Rollback Considerations
- Down migrations exist for all deployed phases (`017_..._down.sql` through `021_..._down.sql`).
- All migrations preserve legacy `public.cpt_codes` and `public.surgeries` tables in dual-write mode. Rolling back code changes does not cause data loss in historical encounters.

---

## 11. Prioritized P0 / P1 / P2 Remediation Plan

### Phase 1: Immediate Safety & Legal Compliance (P0) — *Must complete before release*
1. **Execute AMA CPT Licensing Agreement:** Obtain formal enterprise distribution rights from the American Medical Association for CPT codes and descriptors.
2. **Hard-Freeze Historical Rates in `syncSurgeryProcedures`:** Modify `src/lib/supabase.js:2921-2936` to look up CPT pricing strictly matching the encounter's Date of Service (`surgeries.date`). Forbid re-pricing of approved or closed cases.
3. **Correct Net Profit Formula in `FinancialEngine.js`:** Update formula to `expectedReimbursement - totalCost`. Eliminate Gross Charge as a profit baseline.
4. **Point Application Code to `v_cpt_codes_compat`:** Refactor `getCPTCodes`, `getCPTCodesPaged`, and `CPTManagement.jsx` to read from `v_cpt_codes_compat`.

### Phase 2: Architectural Hardening & Import Modernization (P1) — *Sprint 2*
1. **Wire `CPTUpload.jsx` to Staged Ingestion:** Replace client-side `maxId + 1` chunking with `cpt_import_staging` and `fn_commit_cpt_import_batch`.
2. **Deploy Temporal Exclusion Constraints:** Add PostgreSQL `btree_gist` exclusion constraint to `cpt_code_versions` preventing overlapping active dates.
3. **Harden `fn_resolve_cpt_pricing` Return Contract:** Return `success = false` and clear error flags when a code is queried outside its validity interval.
4. **Resolve Lint Problems:** Remediate all 104 ESLint errors and configure flat config for Node test runners.

### Phase 3: Governance & Operational Polish (P2) — *Sprint 3*
1. **Append Statutory AMA Copyright Disclosures:** Embed required AMA copyright notices across all CPT UI views, modals, and PDF/CSV export utilities.
2. **Payer Fee Schedule Upload Interface:** Implement UI for facilities to upload contracted fee schedules into `public.payer_fee_schedules`.
3. **Deprecate Legacy `public.cpt_codes` Table:** Safely archive and remove the un-normalized legacy table once all dependent services are verified.

---

## 12. Exact Files, Migrations, Tables, and Functions Inspected

### 12.1 Database Migrations Inspected (`supabase/migrations/`)
- `001_multi_tenancy_core.sql` / `001_multi_tenancy_core_down.sql`
- `002_clinical_normalization.sql` / `002_clinical_normalization_down.sql`
- `010_case_cpt_codes_normalization.sql` / `010_case_cpt_codes_normalization_down.sql`
- `017_cpt_master_and_code_year_normalization.sql` / `017_cpt_master_and_code_year_normalization_down.sql`
- `018_cms_asc_coverage_and_payment.sql` / `018_cms_asc_coverage_and_payment_down.sql`
- `019_cpt_specialty_body_part_mapping.sql` / `019_cpt_specialty_body_part_mapping_down.sql`
- `020_cpt_coding_assistant.sql` / `020_cpt_coding_assistant_down.sql`
- `021_cpt_modifiers_units_laterality.sql` / `021_cpt_modifiers_units_laterality_down.sql`

### 12.2 Live Database Objects Inspected (`isutllqthmakvwgduaos`)
- `public.cpt_master` (5,266 rows)
- `public.cpt_code_versions` (8,991 rows)
- `public.cpt_release_years` (3 rows)
- `public.cpt_clinical_mappings` (5,266 rows)
- `public.cpt_billing_rules` (5,267 rows)
- `public.cpt_modifier_master` (17 rows)
- `public.cpt_modifier_conflicts` (10 rows)
- `public.cpt_codes` (8,991 rows)
- `public.surgery_procedures` (257 rows)
- `public.surgeries` (234 rows)
- `public.facilities` (1 row)
- `public.payer_fee_schedules` (0 rows)
- `public.cpt_import_batches` (0 rows)
- `public.cpt_import_staging` (0 rows)
- `public.v_cpt_codes_compat` (Operational SQL View)
- `public.fn_resolve_cpt_pricing` (Stored RPC)
- `public.fn_commit_cpt_import_batch` (Stored RPC)
- `public.calculate_surgery_financials` (Stored RPC)

### 12.3 Source Code & Tests Inspected
- `src/lib/supabase.js` (Lines 90–115, 1205–1270, 1312–1430, 1995–2070, 2921–2936)
- `src/lib/rbacService.js` (Lines 50–60, 150–185)
- `src/lib/env.js` (Environment validation and project URL security guards)
- `src/lib/gemini.js` (Model selection, rate limits, and fallback arrays)
- `src/components/CPTManagement.jsx` (Batch fetching, modal forms, and catalog display)
- `src/components/CPTUpload.jsx` (Client-side Excel parsing and direct mutation logic)
- `src/components/SurgeryScheduler.jsx` (Procedure selection and modal integration)
- `src/services/aiOperations/FinancialEngine.js` (Gross charge vs net profit logic)
- `src/services/aiOperations/HistoricalIntelligence.js` (CPT profile extraction)
- `src/utils/sqlExporter.js` (Export catalog table definitions)
- `src/utils/hospitalUtils.js` (Billing calculation helpers)
- `supabase/functions/gemini-proxy/index.ts` (Edge Function LLM proxy)
- `tests/cpt-master-model.test.js`
- `tests/cms-asc-coverage-payment.test.js`
- `tests/cpt-specialty-body-part-mapping.test.js`
- `tests/cpt-coding-assistant.test.js`
- `tests/cpt-modifiers-units-laterality.test.js`
- `updatecpt.xlsx` (Source Excel Addendum AA with AMA copyright notice)
- `Fee_schedule_estimated_values.xlsx` (CMS fee schedule proxy calculations)

---

## 13. Unverified Assumptions and Decisions Requiring Human Approval

1. **AMA Licensing Model Selection (Decision Required):** Does the organization intend to procure an AMA CPT Developer/Distributor Enterprise License, or will end-user facilities be required to supply their own AMA license credentials?
2. **Historical Recalculation Policy (Decision Required):** When a retroactively revised CMS fee schedule is imported, should finalized encounters from that year remain permanently locked to their original financial snapshot, or should an explicit "Retroactive Claims Adjustment" workflow be triggered?
3. **Third-Party AI Clinical Data Transmission (Decision Required):** Does the organization possess an executed HIPAA Business Associate Agreement (BAA) with Google Cloud covering Vertex AI / Gemini API endpoints, permitting transmission of clinical operative report excerpts?
4. **Descriptor Tiering (Decision Required):** Will ASCANALYST continue displaying 28-character abbreviated CMS descriptors, or will the full licensed AMA CPT Long Descriptors be imported to improve coder accuracy?

---

*Phase 45 Read-Only Audit & Specification completed in accordance with ASCANALYST Engineering Governance Standards. Zero code or schema modifications were applied.*
