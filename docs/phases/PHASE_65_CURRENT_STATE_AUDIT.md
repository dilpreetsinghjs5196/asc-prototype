# PHASE 65 — CURRENT STATE AUDIT: PAYER & INSURANCE SUBSYSTEM

> **Document ID:** `PHASE_65_CURRENT_STATE_AUDIT.md`  
> **Status:** Completed Read-Only Audit  
> **Target System:** ASCANALYST Enterprise Medical Operations & Financial Platform  
> **Scope:** Repository, Database Schema, Financial Calculation Resolvers, Claim Scrubber, Patient Records, and UI Workflows  

---

## 1. Executive Summary

A comprehensive, read-only audit of the ASCANALYST repository and database schema was conducted to evaluate the current state of payer reference data, insurance tracking, fee schedules, and reimbursement engine integration.

### Core Audit Verdict:
The current codebase exhibits a **fragmented, dual-path, and facility-siloed payer architecture**:
1. **Facility Sclerosis**: `public.payers` enforces a `NOT NULL facility_id`. Global national payers (Medicare, Aetna, UnitedHealthcare, Cigna, BCBS) must be redundantly duplicated for every surgery center, breaking cross-facility aggregation and enterprise payer contracting.
2. **Missing Payer Plan Layer**: There is **zero support for Payer Plans** (HMO, PPO, EPO, POS, Medicare Advantage, Managed Medicaid).
3. **Missing Electronic Identifiers**: No structured storage exists for 5-digit EDI Electronic Payer IDs, clearinghouse routing codes (Availity, Change Healthcare, Waystar), or NAIC codes.
4. **Fragile Financial Fallbacks**: When encounter insurance metadata is missing or unparsed, `src/utils/hospitalUtils.js` silently falls back to calculating **Medicare statutory reimbursement**, introducing massive commercial contract leakage.
5. **Orphaned Frontend**: `src/App.jsx` contains an empty, static placeholder card under `activeTab === 'payer'` with no sidebar navigation, no CRUD capabilities, and no contract governance.

---

## 2. Inventory of Existing Payer & Insurance Artifacts

### 2.1 Database Tables & Schemas

| Table Name | Source Migration | Tenancy Scope | Current Purpose | Audit Classification |
|---|---|---|---|---|
| `public.payers` | `002_clinical_normalization.sql` (L93-118) | Facility-siloed (`facility_id NOT NULL`) | Basic payer lookup with `name`, `payer_type`, `payer_code` | **REFACTOR** |
| `public.payer_fee_schedules` | `002_clinical_normalization.sql` (L121-136) | Facility-siloed (`facility_id NOT NULL`) | Flat contracted dollar rate per CPT code | **REFACTOR** |
| `public.claims` | `024_claim_scrubbing_rules.sql` (L31-77) | Facility-siloed | Institutional/professional claim header referencing `primary_payer_id` & `secondary_payer_id` | **KEEP** |
| `public.patients` | `001_initial_schema.sql` & `012_patient_model_hardening.sql` | Facility-siloed | Flat insurance columns (`insurance_provider`, `insurance_policy_number`, `primary_payer_id`) | **REFACTOR** |
| `public.surgeries` | `009_case_master_normalization.sql` (L50-65) | Facility-siloed | Case master with `primary_payer_id` (FK to payers) and `payment_model` | **KEEP / REFACTOR** |
| `public.multiple_procedure_rule_sets` | `040_multiple_procedure_payment_rules.sql` | Hybrid (Global or Facility) | MPPR reduction ruleset referencing optional `payer_id` | **KEEP** |
| `public.facility_vendor_contracts` | `031_facility_vendor_contracts.sql` | Facility-siloed | Vendor implant contracts (proves contract versioning pattern exists) | **KEEP (Reference)** |

#### Detailed Schema Analysis of `public.payers`:
```sql
-- Existing Schema in supabase/migrations/002_clinical_normalization.sql
CREATE TABLE IF NOT EXISTS public.payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payer_type TEXT NOT NULL CHECK (payer_type IN ('Medicare', 'Medicaid', 'Commercial', 'WorkerComp', 'Self-Pay')),
    payer_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_payer_code UNIQUE (facility_id, payer_code)
);
```

#### Defects in `public.payers`:
- **Defect 1 (Facility Sclerosis)**: `facility_id` is mandatory (`NOT NULL`). An enterprise organization with 15 ASCs must insert "Aetna Healthcare" 15 separate times with 15 different UUIDs.
- **Defect 2 (No Electronic Identifiers)**: No fields for EDI 837 Electronic Payer IDs (e.g., `60054` for Aetna, `87726` for UnitedHealthcare).
- **Defect 3 (Primitive Lifecycle)**: Uses a binary boolean `is_active`. Does not support `DRAFT`, `SUSPENDED`, or `ARCHIVED` states.
- **Defect 4 (No Organization Master)**: No concept of an enterprise-level master payer catalog shared across surgical centers.

---

### 2.2 Client Services & Utility Layer

| File Path | Function / Constant | Current Behavior | Classification |
|---|---|---|---|
| `src/lib/supabase.js` (L328-347) | `getPayers(facilityId)` | Queries `payers` table; falls back to `DEFAULT_PAYERS` on error | **REFACTOR** |
| `src/lib/supabase.js` (L3624-3640) | `getPayerFeeSchedules(payerId, facilityId)` | Queries `payer_fee_schedules` with CPT join | **REFACTOR** |
| `src/lib/supabase.js` (L4026-4067) | `DEFAULT_PAYERS` | 5 hardcoded in-memory payers tied to `00000000-0000-0000-0000-000000000002` | **REFACTOR** |
| `src/utils/hospitalUtils.js` (L178-185) | `getBasePrice`, `calculateMedicareRevenue` | Evaluates `payerType` string. If not Medicare, optionally skips MPPR | **REFACTOR** |
| `src/utils/hospitalUtils.js` (L382-388) | Revenue fallback chain | `surgery.patients?.payer_type \|\| surgery.patients?.insurance_type \|\| surgery.payer_type \|\| surgery.insurance_provider \|\| 'Medicare'` | **REFACTOR / FIX** |
| `src/lib/rbacService.js` (L66-108) | `billing.view_yield`, `mppr.manage_payer_rules` | Only 2 payer-related permissions exist in the entire catalog | **MISSING** |
| `src/utils/sqlExporter.js` (L15-18, L200) | Data export utility | Dumps `payers` and `payer_fee_schedules` with facility scope | **KEEP** |

#### Defect in `src/utils/hospitalUtils.js`:
```javascript
// Fragile string fallback: If all fields are empty, defaults to Medicare!
const payerType = surgery.patients?.payer_type || 
                  surgery.patients?.insurance_type || 
                  surgery.payer_type || 
                  surgery.insurance_provider || 
                  'Medicare';
cptTotal = calculateMedicareRevenue(
    cpts,
    wageIndex,
    Boolean(settings?.apply_medicare_mppr),
    { payerType }
);
```
**Impact**: Commercial outpatient surgical encounters without an explicit string match are priced under Medicare statutory Addenda AA/BB rates instead of commercial fee schedules!

---

### 2.3 User Interface Components

| Component File | Role & Current Capabilities | Missing Requirements | Classification |
|---|---|---|---|
| `src/components/ClaimScrubberWorkbench.jsx` | Renders claim cards with `payers.name` and `payers.payer_code` from joined claim record | No plan display, no electronic payer ID verification | **KEEP** |
| `src/components/PatientManagement.jsx` | Populates dropdown from `db.getPayers()`; stores both `primary_payer_id` and string `insurance_provider` | No plan selection, single-payer only (no primary/secondary COB) | **REFACTOR** |
| `src/components/SurgeryScheduler.jsx` | Dropdown for `paymentModel: 'Insurance'`, but completely ignores `primary_payer_id` | Case cannot be assigned a payer or plan at scheduling time | **REFACTOR** |
| `src/App.jsx` (L3860-3869) | Static orphaned placeholder: `<h3 className="card-title">Payer Intelligence</h3>` | No sidebar tab button, no routes, no interactive components | **REPLACE** |
| `PayerMasterDirectory.jsx` | **DOES NOT EXIST** | Enterprise payer catalog, search, filters, category management | **MISSING** |
| `PayerPlanManager.jsx` | **DOES NOT EXIST** | Plan master (HMO, PPO, EPO, Medicare Advantage) | **MISSING** |
| `FacilityPayerConfiguration.jsx` | **DOES NOT EXIST** | Facility enablement, in-network status, clearinghouse mapping | **MISSING** |
| `PatientCoverageModal.jsx` | **DOES NOT EXIST** | Coordination of Benefits (COB: Primary, Secondary, Tertiary) | **MISSING** |

---

## 3. Data Integrity & Inconsistency Audit

### 3.1 Dual-Path Insurance Storage in Patients
In `public.patients`:
- `primary_payer_id` (UUID FK to `public.payers.id`)
- `insurance_provider` (Free-form string, e.g. "Aetna", "AETNA HEALTH", "Aetna PPO")

When a user edits a patient in `PatientManagement.jsx`, lines 235-239 attempt to keep them in sync:
```javascript
let resolvedProviderName = formData.insurance_provider;
if (formData.primary_payer_id) {
  const matchPayer = payers.find(pyr => pyr.id === formData.primary_payer_id);
  if (matchPayer) resolvedProviderName = matchPayer.name;
}
```
However, if an external EMR or bulk CSV imports a patient with only `insurance_provider = 'Blue Cross'`, `primary_payer_id` remains `NULL`. Downstream claim scrubber triggers (`024_claim_scrubbing_rules.sql` L357) then fail or fall back to `'00000000-0000-0000-0000-000000000001'::uuid`.

### 3.2 Single-Payer Limitation (Absence of COB)
In reality, ASC patients frequently have **dual coverage** (e.g., Traditional Medicare Primary + AARP/UnitedHealthcare Secondary Supplemental, or Employer Commercial Primary + Spouse Commercial Secondary).  
Because `public.patients` only possesses singular columns (`insurance_policy_number`, `insurance_group_number`), secondary subscriber IDs cannot be captured during pre-registration, resulting in claim submission delays and manual rebilling.

### 3.3 Fee Schedule Fragility (`ON DELETE CASCADE`)
In `002_clinical_normalization.sql` L124:
```sql
payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE CASCADE
```
If an administrative user deletes an inactive payer record, all historical contracted fee schedules associated with that payer are instantly obliterated, permanently corrupting financial reporting for past encounters.

---

## 4. Upstream Phase Compatibility Assessment

| Phase | Dependency Description | Current Compatibility Status | Required Remediation |
|---|---|---|---|
| **Phase 60: Medicare ASC Base Rate Engine** | Resolves published CMS Addenda rates | **COMPATIBLE** | Ensure Payer Master categorizes Medicare Part B as statutory rate engine target |
| **Phase 61: CMS Payment Indicators** | Interprets A2, G2, J8, N1 indicators | **COMPATIBLE** | Commercial plans must be able to adopt or override CMS payment indicators |
| **Phase 62: Geographic Wage Adjustment** | Applies CBSA wage index | **COMPATIBLE** | Commercial percent-of-Medicare contracts must reference facility CBSA wage index |
| **Phase 63: Device-Intensive Rules** | Protects device offset on J8 implants | **COMPATIBLE** | Payer contracts must specify whether device offsets are carved out or bundled |
| **Phase 64: Multiple Procedure Rules** | Cascading reduction matrix | **COMPATIBLE** | Payer Master must link each commercial payer to its applicable rule set code (`COM_STD_CASCADE`, `COM_SYM_50`) |

---

## 5. Summary Classification Matrix

| Component | Current State | Classification | Target Architecture Action |
|---|---|---|---|
| `public.payers` | Facility-locked, primitive schema | **REFACTOR** | Decouple into `payer_master` (global/org) and `facility_payers` (facility enablement) |
| `public.payer_plans` | Does not exist | **MISSING** | Create normalized `payer_plans` and `facility_payer_plans` |
| `public.payer_identifiers` | Does not exist | **MISSING** | Create effective-dated electronic and clearinghouse routing identifiers |
| `public.payer_fee_schedules` | Flat CPT rate, cascade delete | **REFACTOR** | Retain for backwards compatibility; bridge to versioned `payer_contracts` |
| `public.claims` | Has `primary_payer_id` FK | **KEEP** | Retain FK to `payers` / bridge to `payer_plans` |
| `public.patients` | Flat single insurance columns | **REFACTOR** | Keep legacy columns for backward compatibility; introduce 1NF `patient_insurance_coverages` |
| `src/lib/supabase.js` | 5 hardcoded payers | **REFACTOR** | Implement normalized client service methods with caching and fallback |
| `src/utils/hospitalUtils.js` | Fragile Medicare string fallback | **REFACTOR / FIX** | Replace string matching with authoritative payer category resolver |
| `src/components/PatientManagement.jsx` | Flat insurance fields | **REFACTOR** | Add payer plan selector and multi-coverage tab |
| `src/components/SurgeryScheduler.jsx` | Ignores `primary_payer_id` | **REFACTOR** | Add payer and plan selector to case booking drawer |
| `src/App.jsx` (L3860) | Static empty card | **REPLACE** | Replace with comprehensive Payer Master Management Workspace |
| `src/lib/rbacService.js` | No payer permissions | **MISSING** | Register 12 canonical `payer.*` permissions |

