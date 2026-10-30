# PHASE 65 — RISK AND BLOCKER REGISTER

> **Document ID:** `PHASE_65_RISK_AND_BLOCKER_REGISTER.md`  
> **Status:** Production Risk Analysis & Blocker Triage  
> **Target Release:** Phase 65 — Payer Master & Payer Plan Master  

---

## 1. Executive Risk Summary

A thorough investigation of the existing ASCANALYST repository, database schemas, and financial utility files revealed **two critical P0 blockers** and **three major P1 defects** that must be resolved prior to production deployment of Phase 65.

```
┌────────────────────────────────────────────────────────┐
│               PHASE 65 RISK SEVERITY PROFILE           │
├─────────────────┬───────────────────┬──────────────────┤
│ Critical (P0)   │ 2 Active Blockers │ Release Blocking │
│ High (P1)       │ 3 Active Defects  │ Release Blocking │
│ Medium (P2)     │ 2 Technical Debts │ Sprint Remediation│
└─────────────────┴───────────────────┴──────────────────┘
```

---

## 2. Detailed Blocker Register

### BLOCKER-65-01 (P0 — Critical): Fragile Medicare String Fallback in `hospitalUtils.js`
- **Location**: [`src/utils/hospitalUtils.js`](file:///e:/medicalAI/asc-prototype/src/utils/hospitalUtils.js) (Lines 382–388)
- **Root Cause**:
  ```javascript
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
- **Operational Impact**:
  If an encounter's insurance string does not perfectly match an expected commercial keyword, the engine defaults to calculating **Medicare statutory reimbursement**. Commercial claims with negotiated fee schedules of \$4,500 are calculated at Medicare base rates of \$1,650, severely distorting expected revenue, contract yield analysis, and surgeon margin reports.
- **Pre-Implementation Requirement**:
  Refactor `hospitalUtils.js` to look up `payer_master.payer_category` via relational foreign key. If a commercial contract is unconfigured, return fail-closed uncontracted pricing rather than defaulting to Medicare.

---

### BLOCKER-65-02 (P0 — Critical): Facility-Locked `public.payers` Schema
- **Location**: `supabase/migrations/002_clinical_normalization.sql` (Line 95)
- **Root Cause**:
  ```sql
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE
  ```
- **Operational Impact**:
  Because `facility_id` is `NOT NULL`, global national payers (*Medicare Part B, Aetna, Florida Blue, UnitedHealthcare*) cannot exist as shared reference records. In an organization with 12 surgery centers, "Aetna" must be manually inserted 12 separate times with 12 distinct UUIDs. Cross-facility financial analytics, unified payer contracting, and enterprise EMR imports are completely broken.
- **Pre-Implementation Requirement**:
  Decouple the data model: create `public.payer_master` (global or organization level) and `public.facility_payers` (facility enablement bridge). Make `public.payers.facility_id` nullable or convert `public.payers` to a backward-compatible view.

---

### BLOCKER-65-03 (P1 — High): Flat Single-Insurance Structure in `public.patients` (Lack of COB)
- **Location**: `supabase/migrations/012_patient_model_hardening.sql` & [`src/components/PatientManagement.jsx`](file:///e:/medicalAI/asc-prototype/src/components/PatientManagement.jsx)
- **Root Cause**:
  The `patients` table only possesses singular flat columns: `insurance_provider`, `insurance_policy_number`, `insurance_group_number`.
- **Operational Impact**:
  In outpatient surgical care, over 35% of Medicare patients hold secondary supplemental coverage (Medigap / Plan G), and over 20% of commercial patients have secondary spousal coverage. Because only 1 policy can be recorded, secondary insurance is lost during intake, resulting in unbilled secondary claims and patient balance balance-billing complaints.
- **Pre-Implementation Requirement**:
  Deploy `public.patient_insurance_coverages` (1NF normalized table with `coverage_order IN ('PRIMARY', 'SECONDARY', 'TERTIARY')`) and provide a multi-coverage interface in `PatientManagement.jsx`.

---

### BLOCKER-65-04 (P1 — High): Catastrophic `ON DELETE CASCADE` in `payer_fee_schedules`
- **Location**: `supabase/migrations/002_clinical_normalization.sql` (Line 124)
- **Root Cause**:
  ```sql
  payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE CASCADE
  ```
- **Operational Impact**:
  If a billing administrator deactivates or removes a payer entry, PostgreSQL cascade-deletes all historical contracted fee schedule rows for that payer. Historical encounters, closed claims, and audit snapshots lose their underlying contracted pricing baseline.
- **Pre-Implementation Requirement**:
  Change the foreign key constraint to `ON DELETE RESTRICT` and enforce safe lifecycle status transitions (`ACTIVE` $\rightarrow$ `INACTIVE` $\rightarrow$ `ARCHIVED`) with zero physical deletion.

---

### BLOCKER-65-05 (P1 — High): Absence of Electronic EDI 837 Payer IDs
- **Location**: `supabase/migrations/024_claim_scrubbing_rules.sql` (Line 357)
- **Root Cause**:
  No table or column exists in the database for 5-digit electronic payer IDs or clearinghouse routing codes. Claim generation uses hardcoded fallbacks or unverified strings.
- **Operational Impact**:
  Electronic claims submitted through clearinghouses (Availity, Change Healthcare, Waystar) reject immediately at the EDI gateway (Loop 2010BB NM109 invalid/missing).
- **Pre-Implementation Requirement**:
  Deploy `public.payer_identifiers` with standard clearinghouse routing scopes and add rule `SCRUB-EDI-01` to the claim scrubber.

---

### TECH-DEBT-65-01 (P2 — Medium): Orphaned Placeholder Card in `src/App.jsx`
- **Location**: [`src/App.jsx`](file:///e:/medicalAI/asc-prototype/src/App.jsx) (Lines 3860–3869)
- **Root Cause**:
  `{activeTab === 'payer' && ( ... )}` renders a static mock card and has no corresponding menu item or navigation button in the sidebar.
- **Remediation**:
  Replace this placeholder with the production `PayerMasterDirectory.jsx` workspace under the Financial & Billing sidebar category.

---

### TECH-DEBT-65-02 (P2 — Medium): In-Memory `DEFAULT_PAYERS` Fallback in `supabase.js`
- **Location**: [`src/lib/supabase.js`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js) (Lines 4026–4067)
- **Root Cause**:
  If the `payers` query fails, client services fall back to 5 hardcoded in-memory payers tied exclusively to facility `00000000-0000-0000-0000-000000000002`.
- **Remediation**:
  Replace hardcoded facility ID with active session facility resolution and ensure client caching uses local IndexedDB/localStorage rather than mock arrays.

---

## 3. Pre-Implementation Remediation Checklist

To transition from **AUDIT** to **IMPLEMENTATION**, the following conditions must be satisfied:

- [ ] **Data Model Approved**: Migration `041_payer_master.sql` drafted with `payer_master`, `facility_payers`, `payer_plans`, `payer_identifiers`, `patient_insurance_coverages`, `payer_contracts`.
- [ ] **Zero CASCADE Deletes**: All relational foreign keys to `payer_master` use `ON DELETE RESTRICT`.
- [ ] **Medicare Fallback Removed**: PR drafted for `src/utils/hospitalUtils.js` ensuring uncontracted commercial encounters fail-closed.
- [ ] **RLS Certified**: All RLS policies validated to use `is_facility_accessible` and `user_has_facility_role` without querying `user_roles`.
- [ ] **Backward Compatibility Verified**: Existing `public.payers` references in `claims` and `surgeries` remain non-breaking.

