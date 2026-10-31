# PHASE 66 — PAYER CONTRACT MODEL: READ-ONLY CURRENT STATE AUDIT

**Author:** ASCANALYST Architecture & Financial Engineering Team  
**Scope:** Payer Contracts, Contract Versions, Facility Scopes, Amendments, Fee Schedules, Reimbursement Integration  
**Status:** AUDIT COMPLETE (Read-Only — No Database or Code Modifications Executed)  
**Proposed Migration Reference:** `042_payer_contract_model.sql` (Planning Reference Only)  

---

## 1. Executive Summary & Audit Mandate

This read-only audit evaluates the current state of payer contracts, contract versioning, fee schedules, facility scopes, document management, and commercial reimbursement logic in ASCANALYST.

### Key Audit Findings:
1. **Phase 65 Baseline Exists**: Migration `041_payer_master.sql` successfully deployed the foundation: `payer_master`, `payer_plans`, `payer_identifiers`, `facility_payers`, `facility_payer_plans`, and `patient_insurance_coverages`. It also introduced initial skeleton tables `payer_contracts` and `payer_contract_versions`.
2. **Facility-Only vs. Organization-Wide Tenancy Gap**: Current `payer_contracts` table enforces `facility_id UUID NOT NULL REFERENCES public.facilities(id)`. This forces redundant contract re-entry when a master agreement covers multiple surgical centers under a single corporate management group or organization.
3. **Missing Scope Granularity**: There are no tables for `payer_contract_facility_scopes`, `payer_contract_plan_scopes`, or `payer_contract_procedure_scopes`. A contract version currently cannot deterministically restrict its terms to specific health plans (e.g. HMO vs. PPO) or carve out clinical specialties.
4. **Legacy Flat Fee Schedule Disconnect**: `payer_fee_schedules` (created in `002_clinical_normalization.sql`) references the legacy `payers(id)` table and `cpt_codes(id)` with a flat `contracted_rate`. It lacks versioning, approval workflows, reimbursement methodology abstraction, and facility scoping.
5. **Vendor Contracts Distinct from Payer Agreements**: `facility_vendor_contracts` (created in `033_consolidated_implant_phases_54_to_57.sql`) governs implant OEM suppliers, SKUs, and consignment logistics. It must remain strictly separated from payer revenue agreements.
6. **No Contract Provenance on Claims or Surgeries**: `public.claims` and `public.surgeries` capture `primary_payer_id`, but lack `contract_id` and `contract_version_id` foreign keys. Historical claim snapshots do not store the exact contract version used for adjudication.
7. **Document Management Missing for Payers**: Private storage exists for vendor documents (`'contract-documents'`), but no dedicated private bucket or metadata table exists for confidential payer fee agreements and signed addenda.

---

## 2. Upstream Dependencies Audit (Phases 60–65)

| Component | Table / Object | Status | Role in Payer Contracts |
| :--- | :--- | :--- | :--- |
| **Phase 60** | `medicare_base_rate_calculations` | **EXISTS** | Provides statutory baseline when commercial contracts use `PERCENT_OF_MEDICARE`. |
| **Phase 61** | `cms_payment_indicator_definitions` | **EXISTS** | Identifies surgical vs ancillary vs contractor-priced (R2) procedures. |
| **Phase 62** | `medicare_wage_indices`, `facility_cbsa_assignments` | **EXISTS** | Informs geographic wage index scaling for Medicare-linked commercial multipliers. |
| **Phase 63** | `cms_device_intensive_procedures`, `cms_c_code_crosswalk` | **EXISTS** | Governs device portion non-degradation and implant carve-out terms. |
| **Phase 64** | `multiple_procedure_rule_sets`, `multiple_procedure_rules` | **EXISTS** | Referenced by contract versions via `mppr_rule_set_code` to dictate secondary procedure discounts. |
| **Phase 65** | `payer_master`, `payer_plans`, `payer_identifiers` | **EXISTS** | Core entity model. Contracts bind directly to `payer_master(id)` and filter by `payer_plans(id)`. |

---

## 3. Detailed Component Audit & Classification

Each contract-related component across the repository is classified below as **KEEP**, **REFACTOR**, **REPLACE**, or **MISSING**.

### A. Database Tables & Schemas

| Component Name | Type | Current Location | Classification | Evidence & Justification |
| :--- | :--- | :--- | :--- | :--- |
| `public.payer_master` | Table | `supabase/migrations/041_payer_master.sql:25` | **KEEP** | Normalized master directory of insurance carriers (Medicare, BCBS, Aetna, etc.). Required parent. |
| `public.payer_plans` | Table | `supabase/migrations/041_payer_master.sql:52` | **KEEP** | Benefit plans (HMO, PPO, EPO). Required for plan-level contract scoping. |
| `public.payer_contracts` | Table | `supabase/migrations/041_payer_master.sql:181` | **REFACTOR** | Current table has `facility_id UUID NOT NULL`. Must refactor to support `organization_id UUID NOT NULL` with optional facility scope, add legal entity details, execution dates, and renewal governance. |
| `public.payer_contract_versions` | Table | `supabase/migrations/041_payer_master.sql:199` | **REFACTOR** | Stores version number, effective dates, multiplier, and notes. Must expand with `status` (DRAFT, APPROVED, ACTIVE), approval timestamps, immutable lock trigger, and amendment tracking. |
| `public.payer_contract_facility_scopes` | Table | *None* | **MISSING** | Required bridge entity enabling a single master contract to cover 1 to N specific surgical facilities. |
| `public.payer_contract_plan_scopes` | Table | *None* | **MISSING** | Required bridge entity enabling a contract version to apply to specific benefit plans while excluding others. |
| `public.payer_contract_service_scopes` | Table | *None* | **MISSING** | Required entity defining procedure/specialty-level carve-outs, case-rate bundles, or exclusions. |
| `public.payer_contract_terms` | Table | *None* | **MISSING** | Required normalized entity storing granular financial terms (base rate, multiplier, fee schedule amounts, % of billed charges). |
| `public.payer_contract_documents` | Table | *None* | **MISSING** | Required metadata table tracking signed PDFs, fee exhibits, SHA-256 integrity hashes, and private storage references. |
| `public.payer_contract_amendments` | Table | *None* | **MISSING** | Required formal amendment tracking entity capturing revision rationale, effective dates, and two-person approvals. |
| `public.payer_contract_approvals` | Table | *None* | **MISSING** | Required server-side audit trail recording legal and CFO approval sign-offs before version activation. |
| `public.payer_fee_schedules` | Table | `supabase/migrations/002_clinical_normalization.sql:121` | **REPLACE** | Legacy flat table referencing `payers(id)` and `cpt_codes(id)`. Lacks versioning, scopes, and methodology abstraction. Deprecated. |
| `public.facility_vendor_contracts` | Table | `supabase/migrations/033_consolidated_implant_phases_54_to_57.sql:772` | **KEEP** | Governs implant OEM vendors and supply procurement. Must NOT be reused or conflated with payer revenue agreements. |
| `public.claims` | Table | `supabase/migrations/024_claim_scrubbing_rules.sql:31` | **REFACTOR** | Has `primary_payer_id`, but lacks `contract_id` and `contract_version_id`. Must link claims to adjudicated contract version. |
| `public.surgery_procedures` | Table | `supabase/migrations/002_clinical_normalization.sql:141` | **REFACTOR** | Stores `contracted_reimbursement NUMERIC(12,2)` as a flat value. Lacks foreign key reference to originating contract version. |
| `public.surgery_financial_snapshots` | Table | `supabase/migrations/003_audit_and_snapshots.sql:235` | **REFACTOR** | Stores JSONB snapshot. Needs explicit contract version identifier in JSON schema to prove historical reproducibility. |

---

## 4. Frontend & Service Layer Audit

### A. Frontend Components
- **`src/components/PayerMasterDirectory.jsx` (Tab 4 — Commercial Contracts Matrix)**:
  - **Status**: **REFACTOR**
  - **Evidence**: Lines 48–85 define a static local state array (`contracts`) displaying mock contracts for Florida Blue, Aetna, and UHC.
  - **Requirement**: Must replace mock array with authoritative client service calls fetching live contracts, versions, and scope bindings from `payerContractService.js`.
- **`src/components/FacilityVendorContracts.jsx`**:
  - **Status**: **KEEP**
  - **Evidence**: Implements implant OEM contract management. Functions correctly for vendor procurement. Must remain independent of payer contracts.
- **Contract Resolution Simulator**:
  - **Status**: **MISSING**
  - **Requirement**: UI needs an interactive resolution preview tool where a biller can enter Facility + Payer + Plan + Date of Service + CPT code and inspect the resolved contract version, methodology, and calculated rate.

### B. Service Layer & Logic
- **`src/lib/payerMasterService.js`**:
  - **Status**: **REFACTOR**
  - **Evidence**: Contains empty fallback `payer_contracts: []` at line 171.
  - **Requirement**: Separate payer master operations from contract lifecycle by introducing dedicated `payerContractService.js`.
- **`src/utils/hospitalUtils.js`**:
  - **Status**: **REFACTOR**
  - **Evidence**: Lines 383–395 enforce `strictPayerCheck` on commercial encounters, blocking uncontracted claims from defaulting to Medicare statutory rates.
  - **Requirement**: Wire `hospitalUtils.js` to dynamically query the active commercial contract version for non-Medicare claims instead of throwing errors or requiring hardcoded rates.
- **`src/lib/rbacService.js`**:
  - **Status**: **REFACTOR**
  - **Evidence**: Contains only a single coarse permission: `payer.manage_contracts`.
  - **Requirement**: Register granular permissions for contract creation, versioning, financial terms entry, legal/CFO approval, document upload, and contract activation.

---

## 5. Security, Tenancy & Provenance Audit

1. **Multi-Tenancy Model**:
   - `payer_contracts` currently enforces `facility_id` directly, making multi-facility enterprise contracts impossible without duplicating records across facilities.
   - Target model must support:
     - `organization_id`: Organization owning the contractual agreement.
     - `facility_scope_mode`: `ALL_FACILITIES`, `SPECIFIC_FACILITIES`, or `EXCLUDE_FACILITIES`.
     - `payer_contract_facility_scopes`: Explicit join table mapping allowed facilities.
2. **Row Level Security (RLS)**:
   - Current RLS policy `Payer Contracts Write Policy` allows any authenticated user with facility access to modify contracts.
   - Target model must restrict contract editing to `cfo`, `facility_admin`, and `org_admin`, and require two-person approval for financial term activation.
3. **Immutability & Provenance**:
   - Approved contract versions must be protected by database-level trigger locks (`trg_block_approved_contract_version_modification`) preventing retroactive edits.
   - Any modification must require creating a new version ($N+1$) or registering a formal amendment.
4. **Document Storage Security**:
   - Contract PDF agreements contain proprietary fee structures and trade secrets.
   - Must reside in a private bucket (`payer-contracts`) protected by RLS and accessed exclusively via short-lived signed URLs (15-minute TTL).

---

## 6. Audit Conclusion & Readiness Matrix

| Area | Production Readiness | Blocker Severity | Action Required |
| :--- | :---: | :---: | :--- |
| **Upstream Payer Master (Phase 65)** | **100% READY** | None | Fully operational foundation. |
| **Payer Contract Data Model** | **30% READY** | **P1 (High)** | Refactor `payer_contracts` & `payer_contract_versions`; add scopes, terms, documents, amendments, approvals. |
| **Reimbursement Engine Integration** | **40% READY** | **P1 (High)** | Replace hardcoded commercial rates with deterministic contract resolution engine. |
| **RBAC & Two-Person Approval** | **25% READY** | **P1 (High)** | Split `payer.manage_contracts` into 16 fine-grained permissions; enforce approval separation. |
| **Document Storage Security** | **0% READY** | **P2 (Medium)** | Deploy private `payer-contracts` bucket and signed URL generator. |
| **UI Workflow & Previews** | **35% READY** | **P2 (Medium)** | Replace Tab 4 mock cards in `PayerMasterDirectory.jsx` with full contract manager & resolution simulator. |

*Proceed to Specification documents.*
