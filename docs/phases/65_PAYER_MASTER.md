# 65 PAYER MASTER & PAYER PLAN MASTER

## Purpose
Payer, insurance carrier, and health plan master data management for Ambulatory Surgery Centers.

## Scope
- Define production requirements for enterprise payer master data, health plans, and electronic clearinghouse routing.
- Preserve compatibility with current ASCANALYST product, schemas, claims, and pricing modules.
- Use deterministic, auditable rules for financial resolution, contract tiering, and claim generation.
- Enforce organization/facility tenancy, HIPAA § 164.312 security, and role-based access controls.

---

## Current State Audit Summary
A comprehensive read-only audit of the repository was completed:
- **`public.payers`** (Migration `002_clinical_normalization.sql`): **REFACTOR**. Facility-siloed (`facility_id NOT NULL`), missing electronic EDI 837 IDs, missing plan layer, binary `is_active` lifecycle.
- **`public.payer_fee_schedules`** (Migration `002`): **REFACTOR**. Flat CPT rate with dangerous `ON DELETE CASCADE`.
- **`public.patients`** (Migrations `001` & `012`): **REFACTOR**. Flat single-insurance columns; Coordination of Benefits (COB) is missing.
- **`public.claims`** (Migration `024`): **KEEP**. Holds `primary_payer_id` and `secondary_payer_id` with `ON DELETE RESTRICT`.
- **`src/utils/hospitalUtils.js`**: **REFACTOR / FIX**. Critical P0 blocker: lines 382–388 silently fall back to calculating Medicare revenue when commercial payer strings are unparsed.
- **`src/App.jsx`**: **REPLACE**. Line 3860 contains an unreachable, orphaned static placeholder card under `activeTab === 'payer'`.
- **Missing Tables**: `payer_master`, `payer_plans`, `payer_identifiers`, `facility_payers`, `facility_payer_plans`, `patient_insurance_coverages`, `payer_contracts`.

---

## Target Architecture
1. **Decoupled Tenancy**:
   - `payer_master`: Global/Organization enterprise catalog (shared national payers like Medicare, Aetna, UHC, Cigna exist once).
   - `facility_payers`: Surgery center enablement bridge (configures local in-network participation, preferred clearinghouse, and localized billing notes).
2. **Normalized Plan Layer**:
   - `payer_plans`: Models commercial products (HMO, PPO, EPO, POS, Medicare Advantage, Medicaid MCO) with timely filing limits and prior-auth rules.
   - `facility_payer_plans`: Facility-specific plan acceptance and copay overrides.
3. **Multi-Identifier Electronic Routing**:
   - `payer_identifiers`: 5-digit EDI Payer IDs for 837 claims, clearinghouse routing codes (Availity, Change Healthcare, Waystar), and NAIC codes.
4. **Coordination of Benefits (COB)**:
   - `patient_insurance_coverages`: 1NF normalized policies supporting Primary, Secondary, and Tertiary insurance coverage per patient.
5. **Contract Versioning**:
   - `payer_contracts` & `payer_contract_versions`: Formalizes 5 commercial reimbursement models (Percent of Medicare, Commercial Fee Schedule, Percent of Billed, Case Rate Bundles, Hybrid Device Carve-Out).

---

## Data Model / Schema (Proposed Migration `041_payer_master.sql`)

1. **`public.payer_master`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `organization_id UUID REFERENCES organizations(id)`
   - `payer_code VARCHAR(50) UNIQUE NOT NULL`
   - `legal_name VARCHAR(255) NOT NULL`
   - `trade_name VARCHAR(255)`
   - `payer_category VARCHAR(30) NOT NULL CHECK (payer_category IN ('Medicare', 'Medicaid', 'Commercial', 'Medicare_Advantage', 'Medicaid_Managed', 'Workers_Comp', 'Veterans_Affairs', 'Tricare', 'Self_Pay', 'Other'))`
   - `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'))`
   - `naic_code VARCHAR(10)`, `tax_id VARCHAR(20)`, `website_url VARCHAR(255)`, `claims_phone VARCHAR(30)`
   - `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

2. **`public.payer_plans`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `payer_id UUID NOT NULL REFERENCES payer_master(id) ON DELETE RESTRICT`
   - `plan_code VARCHAR(50) NOT NULL`
   - `plan_name VARCHAR(255) NOT NULL`
   - `plan_type VARCHAR(30) NOT NULL CHECK (plan_type IN ('HMO', 'PPO', 'EPO', 'POS', 'MEDICARE_ADVANTAGE_HMO', 'MEDICARE_ADVANTAGE_PPO', 'MEDICAID_MCO', 'INDEMNITY', 'HIGH_DEDUCTIBLE', 'OTHER'))`
   - `timely_filing_days INTEGER NOT NULL DEFAULT 180`
   - `requires_prior_auth BOOLEAN NOT NULL DEFAULT true`
   - `is_active BOOLEAN NOT NULL DEFAULT true`
   - `CONSTRAINT uq_payer_plan_code UNIQUE (payer_id, UPPER(plan_code))`

3. **`public.payer_identifiers`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `payer_id UUID NOT NULL REFERENCES payer_master(id) ON DELETE CASCADE`
   - `identifier_type VARCHAR(40) NOT NULL CHECK (identifier_type IN ('EDI_PAYER_ID', 'CLEARINGHOUSE_ROUTING_CODE', 'ELIGIBILITY_PAYER_ID', 'CLAIM_STATUS_PAYER_ID', 'NAIC_CODE', 'STATE_MEDICAID_ID'))`
   - `identifier_value VARCHAR(60) NOT NULL`
   - `clearinghouse VARCHAR(40) NOT NULL DEFAULT 'GLOBAL' CHECK (clearinghouse IN ('GLOBAL', 'AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'TIRAS', 'DIRECT_EDI'))`
   - `transaction_scope VARCHAR(30) NOT NULL DEFAULT 'ALL'`
   - `effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE`
   - `effective_end_date DATE`

4. **`public.facility_payers`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE`
   - `payer_id UUID NOT NULL REFERENCES payer_master(id) ON DELETE RESTRICT`
   - `participation_status VARCHAR(25) NOT NULL DEFAULT 'IN_NETWORK' CHECK (participation_status IN ('IN_NETWORK', 'OUT_OF_NETWORK', 'PAR_PENDING', 'TERMINATED'))`
   - `preferred_clearinghouse VARCHAR(40) NOT NULL DEFAULT 'AVAILITY'`
   - `facility_payer_code_override VARCHAR(30)`
   - `billing_npi_override VARCHAR(10)`
   - `electronic_claim_enabled BOOLEAN NOT NULL DEFAULT true`
   - `billing_instructions TEXT`
   - `is_enabled BOOLEAN NOT NULL DEFAULT true`
   - `CONSTRAINT uq_facility_payer_link UNIQUE (facility_id, payer_id)`

5. **`public.patient_insurance_coverages`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE`
   - `patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE`
   - `coverage_order VARCHAR(15) NOT NULL DEFAULT 'PRIMARY' CHECK (coverage_order IN ('PRIMARY', 'SECONDARY', 'TERTIARY'))`
   - `payer_id UUID NOT NULL REFERENCES payer_master(id) ON DELETE RESTRICT`
   - `plan_id UUID REFERENCES payer_plans(id) ON DELETE SET NULL`
   - `policy_number VARCHAR(80) NOT NULL`, `group_number VARCHAR(60)`
   - `subscriber_name VARCHAR(150) NOT NULL`, `subscriber_dob DATE`, `subscriber_relationship VARCHAR(20) NOT NULL DEFAULT 'SELF'`
   - `copay_amount NUMERIC(10, 2)`, `deductible_amount NUMERIC(10, 2)`, `coinsurance_pct NUMERIC(5, 4)`
   - `verification_status VARCHAR(25) NOT NULL DEFAULT 'UNVERIFIED'`
   - `CONSTRAINT uq_patient_coverage_order UNIQUE (patient_id, coverage_order)`

6. **`public.payer_contracts` & `payer_contract_versions`**:
   - Formal contract header and versioned terms.
   - Links to `multiple_procedure_rule_sets.rule_set_code` (e.g., `COM_STD_CASCADE`).
   - Supports device carve-outs at verified acquisition cost + markup.

7. **`public.payer_audit_logs`**:
   - Immutable state-diff ledger tracking payer lifecycle transitions, merges, and identifier edits.

---

## Business Rules & Deterministic Lifecycle

1. **Payer Lifecycle State Machine**:
   - `DRAFT` $\rightarrow$ `ACTIVE` $\rightarrow$ `SUSPENDED` $\rightarrow$ `INACTIVE` $\rightarrow$ `ARCHIVED`.
   - Inactive or Suspended payers are hidden from scheduling/booking dropdowns, but remain 100% accessible on historical encounters and claims.
   - Physical deletion (`DELETE FROM payer_master`) is **strictly forbidden**.
2. **Zero `ON DELETE CASCADE` on Core Entities**:
   - All relational foreign keys to `payer_master` use `ON DELETE RESTRICT`. Historical financial, billing, and clinical encounters are immutable.
3. **Fail-Closed Reimbursement Resolution**:
   - If a commercial payer contract is missing, the engine **must never default to Medicare statutory rates**. It must return an explicit `UNCONTRACTED_PRICING_REQUIRED` status.
4. **EDI Routing Prioritization**:
   - Claim scrubber and EDI generators resolve: Facility Override $\rightarrow$ Active Clearinghouse EDI ID $\rightarrow$ Global EDI ID $\rightarrow$ Fatal Error `SCRUB-EDI-01`.
5. **Deduplication & Merge Governance**:
   - Multi-tier matching (Exact EDI ID $\rightarrow$ Exact NAIC $\rightarrow$ Tax ID $\rightarrow$ Fuzzy Name Distance > 0.88).
   - No automatic merges on fuzzy name similarity alone; requires explicit human administrative approval.

---

## Permissions & Security (RBAC)

1. **Row Level Security (RLS)**:
   - Tenant isolation enforced via `public.is_facility_accessible(facility_id)` and `public.user_has_facility_role(facility_id, role_slugs)`.
   - **Zero queries to `public.user_roles`**.
2. **Canonical Permissions (12 New Permissions in `src/lib/rbacService.js`)**:
   - `payer.view` (Standard): View global and facility-enabled payers, benefit plans, and routing IDs.
   - `payer.create` (Sensitive): Draft new master payers and plans.
   - `payer.edit` (Sensitive): Update payer metadata, legal names, addresses.
   - `payer.activate` (Critical): Transition payer lifecycle status between Active, Suspended, Inactive.
   - `payer.archive` (Critical): Permanently archive retired payers.
   - `payer.manage_plans` (Sensitive): Create and edit benefit plan products.
   - `payer.manage_identifiers` (Sensitive): Configure electronic EDI payer IDs.
   - `payer.configure_facility` (Sensitive): Configure facility enablement, in-network status, clearinghouse settings.
   - `payer.manage_contracts` (Critical): Create and approve commercial payer contracts.
   - `payer.manage_coverages` (Sensitive): Manage patient insurance coverages and COB.
   - `payer.import` (Sensitive): Upload and stage bulk clearinghouse payer directories.
   - `payer.export` (Sensitive): Export master payer directories.
3. **AI Parity**:
   - AI Operations Analyst tools operate strictly within the authenticated caller's facility context and permissions. Automated mutations by AI are prohibited.

---

## API & Backend Service Requirements (`src/lib/payerMasterService.js`)

The client service layer provides authoritative contracts wired to the `db` singleton:
- `getPayerMasterDirectory(options)`: Filtered, paginated search across master payers.
- `getPayerById(payerId)`: Comprehensive entity details including plans, identifiers, and contracts.
- `getPayerPlans(payerId)`: Retrieves benefit plan products.
- `getFacilityPayers(facilityId)`: Retrieves facility enablement, in-network status, and EDI overrides.
- `getPatientCoverages(patientId)`: Retrieves sequenced primary/secondary/tertiary policies.
- `savePatientCoverage(coverageData)`: Upserts patient insurance coverage with COB validation.
- `toggleFacilityPayer(facilityId, payerId, isEnabled)`: Facility enablement toggle with audit logging.
- `stagePayerImport(filePayload)`: Parses, validates, and stages bulk CSV/clearinghouse directories.
- `commitPayerImport(batchId)`: Server-side atomic commit of staged records.

---

## UI / Workflow Requirements

1. **New Workspace Component (`src/components/PayerMasterDirectory.jsx`)**:
   - **Tab 1: Master Directory**: Searchable list with category filters, status chips, plan counts, and EDI IDs.
   - **Tab 2: Benefit Plans**: Products (HMO, PPO, Medicare Advantage) with timely filing limits and pre-auth rules.
   - **Tab 3: Facility Enablement**: In-network/out-of-network toggles, preferred clearinghouse selector, billing notes.
   - **Tab 4: Contracts Matrix**: Percent of Medicare multipliers, fee schedules, device carve-outs.
   - **Tab 5: Import & Deduplication**: Staging workbench, 4-tier match confidence badges, human review/commit.
   - **Maestro Purple Ban**: Strictly compliant (Slate `#0f172a`, Blue `#2563eb`, Emerald `#059669`, Amber `#d97706`, Red `#dc2626`).
2. **Sidebar Navigation**:
   - Add `"Payer Master"` under the Billing & Financial sidebar section in `src/App.jsx`, replacing the orphaned placeholder card.
3. **Enhanced Forms**:
   - `PatientManagement.jsx`: Add multi-coverage insurance tabs (Primary, Secondary, Tertiary).
   - `SurgeryScheduler.jsx`: Add Payer and Plan dropdowns to case booking drawer.

---

## QA & Test Cases (`tests/payer-master-and-plans.test.js`)

1. **Migration 041 Verification**: Forward & down SQL substantive and valid.
2. **Schema Invariants**: Table creation, foreign keys (`ON DELETE RESTRICT`), unique constraints, check constraints.
3. **RLS Tenancy**: Multi-tenant isolation verified with zero queries to `public.user_roles`.
4. **Decoupled Tenancy**: Multiple facilities enable the same global master payer without record duplication.
5. **Plan Hierarchy**: Plan records enforce parent payer integrity.
6. **Electronic Routing**: Payer ID resolution prioritizes facility clearinghouse override over global ID.
7. **COB Sequencing**: `patient_insurance_coverages` enforces unique `(patient_id, coverage_order)`.
8. **Remediate Blocker 1**: Uncontracted commercial encounters fail-closed without defaulting to Medicare.
9. **RBAC Catalog**: All 12 `payer.*` permissions verified in `rbacService`.
10. **Maestro Purple Ban Audit**: Static check across all Phase 65 files for zero prohibited purple/violet/indigo tokens.

---

## Acceptance Criteria
- [ ] Build passes cleanly (`npm run build`).
- [ ] Lint passes with 0 errors (`npx eslint`).
- [ ] All 10+ test cases pass in `tests/payer-master-and-plans.test.js`.
- [ ] Existing 835 unit/integration tests continue to pass without regressions (`npm test`).
- [ ] Zero mock or placeholder records presented as production truth.
- [ ] Multi-tenant isolation verified for facility data.
- [ ] P0 and P1 issues block implementation until resolved.

---

## Dependencies
- Upstream: Phase 60 (Base Rate), Phase 61 (Indicators), Phase 62 (Wage Index), Phase 63 (Device Offset), Phase 64 (MPPR).
- Migrations: `002_clinical_normalization.sql`, `012_patient_model_hardening.sql`, `024_claim_scrubbing_rules.sql`.
- Infrastructure: Existing `facilities`, `organizations`, `patients`, `surgeries`, `claims` tables.

---

## Definition of Done
Phase 65 is complete only when the decoupled data model, deterministic service layer, multi-coverage COB UI, RBAC permissions, fail-closed financial resolution, audit logging, automated tests, and documentation are verified and committed.

---

## Final Verdict

### Status: **CONDITIONAL GO**

#### Conditions to satisfy before implementation:
1. **Pre-Implementation Blocker Remediation**:
   - Fix `src/utils/hospitalUtils.js` line 382 to eliminate the silent Medicare string fallback on unparsed commercial encounters.
2. **Zero CASCADE Deletes**:
   - Ensure all foreign keys referencing `payer_master` enforce `ON DELETE RESTRICT`.
3. **Migration 041 Draft**:
   - Prepare `041_payer_master.sql` and `041_payer_master_down.sql` following the approved data dictionary.

> **IMPORTANT**: This is an audit and specification deliverable. Do not execute migrations, deploy database changes, or modify application source code until approved.
