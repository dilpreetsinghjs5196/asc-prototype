# 63 DEVICE INTENSIVE PAYMENT RULES

## Purpose
Device-intensive procedure/payment logic and packaging rules.

## Scope
- Define production requirements for this area.
- Preserve compatibility with the current ASCANALYST product where appropriate.
- Use deterministic, auditable rules for financial and billing logic.
- Enforce organization/facility tenancy and RBAC.

## Current State
Document what exists today in the repository/database before implementation. Classify each relevant component as **KEEP**, **REFACTOR**, **REPLACE**, or **MISSING**.

### 1. Component Classification Matrix

| Component / Artifact | Current File / Location | Classification | Audit Findings & Production Gap |
| :--- | :--- | :--- | :--- |
| **`cms_asc_addenda`** | `supabase/migrations/036_medicare_asc_base_rate_engine.sql` | **REFACTOR** | Has `is_device_intensive` and `device_offset_percentage`, but seeded with flat 35% across only 5 procedures instead of code-specific empirical offsets. |
| **`facility_medicare_settings`** | `supabase/migrations/036_medicare_asc_base_rate_engine.sql` | **KEEP** | Effective facility Medicare configuration; keeps CBSA and ASCQR compliance status. |
| **`fn_resolve_medicare_base_rate`** | `supabase/migrations/036_medicare_asc_base_rate_engine.sql` | **REFACTOR** | Implements baseline 50/50 formula and carves out device offset, but currently defaults device offset to 0.35 if missing. Must query authoritative offset table. |
| **`fn_scrub_claim_lines` (SCRUB-21)** | `supabase/migrations/037_cms_payment_indicators.sql` | **REFACTOR** | Validates presence of *any* device, but does not verify if the attached device matches CMS-required HCPCS C-code category. |
| **Gross Charge Fallback** | `src/utils/hospitalUtils.js:162` | **REPLACE** | Falls back to `cpt.gross_charge` when Medicare reimbursement is missing. Must be eliminated to prevent gross charge revenue leaks. |
| **`cms_device_intensive_procedures`** | Target Migration 039 | **MISSING** | Dedicated table for CMS-published code-specific empirical device offset percentages across ~600+ J8 procedures. |
| **`cms_device_categories`** | Target Migration 039 | **MISSING** | Master directory of Level II C-codes (`C1776`, `C1785`, `C1767`, etc.) with packaging invariants. |
| **`cpt_device_category_crosswalk`** | Target Migration 039 | **MISSING** | CMS Device-to-Procedure Edits crosswalk enforcing mandatory C-code reporting for J8 procedures. |
| **`medicare_device_calculation_ledgers`** | Target Migration 039 | **MISSING** | Audit ledger reconciling CMS device reimbursement allowance against actual vendor acquisition invoice costs. |

---

## Target State
Describe the production-ready target behavior, data model, services, user experience, permissions, and integrations.

1. **Statutory Methodology:** Full adherence to **42 CFR § 416.171(b)(2)**. Procedures with device offset $> 30.00\%$ are classified as device-intensive (Indicator `J8`). The device offset amount is calculated from the national unadjusted baseline rate and is **100% exempt from geographic wage adjustment**.
2. **Quality Reporting Isolation:** Under 42 CFR § 416.171(a)(2), the 2.0% ASCQR non-compliance reduction factor (`0.9800`) applies **strictly to the wage-adjusted service portion**, never to the device offset amount.
3. **MPPR Carve-Out Protection:** Under 42 CFR § 416.172, on secondary J8 procedures, the 50% multiple procedure reduction applies **strictly to the service portion**. The device offset amount is paid at 100%.
4. **C-Code Packaging:** All implant hardware HCPCS C-codes (`C1776`, `C1785`, `C1767`, `L8699`) are 100% packaged into the primary procedure APC ($0.00 separate Medicare allowable).
5. **Margin Reconciliation:** Real-time variance tracking between CMS device reimbursement allowance and actual vendor invoice costs recorded in `case_device_cost_allocations`.

---

## Data Model / Schema
List required tables, columns, indexes, foreign keys, effective dates, provenance, and migration requirements.

### Target Migration: `039_device_intensive_payment_rules.sql`

```sql
-- 1. CMS Master Device Categories (C-Codes)
CREATE TABLE IF NOT EXISTS public.cms_device_categories (
    category_code VARCHAR(10) PRIMARY KEY,
    category_title TEXT NOT NULL,
    clinical_construct VARCHAR(50) NOT NULL,
    implant_category_id UUID REFERENCES public.implant_categories(id) ON DELETE SET NULL,
    is_packaged BOOLEAN NOT NULL DEFAULT true,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. CMS Device-Intensive Procedures (Official Empirical Offsets)
CREATE TABLE IF NOT EXISTS public.cms_device_intensive_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT,
    cpt_code VARCHAR(5) NOT NULL,
    payment_indicator VARCHAR(2) NOT NULL DEFAULT 'J8' CHECK (payment_indicator IN ('J8', 'G2', 'P3')),
    device_offset_percentage NUMERIC(5, 4) NOT NULL CHECK (device_offset_percentage >= 0.3000 AND device_offset_percentage <= 0.9999),
    national_unadjusted_rate NUMERIC(10, 2) NOT NULL CHECK (national_unadjusted_rate > 0),
    device_offset_amount NUMERIC(10, 2) NOT NULL,
    service_portion_unadjusted NUMERIC(10, 2) NOT NULL,
    apc_code VARCHAR(5),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_cms_device_cpt_release UNIQUE (release_id, cpt_code, effective_start_date)
);

-- 3. CPT-to-Device Category Crosswalk (CMS Device-to-Procedure Edits)
CREATE TABLE IF NOT EXISTS public.cpt_device_category_crosswalk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_code VARCHAR(5) NOT NULL,
    device_category_code VARCHAR(10) NOT NULL REFERENCES public.cms_device_categories(category_code) ON DELETE RESTRICT,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity >= 1),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_cpt_device_crosswalk UNIQUE (cpt_code, device_category_code, effective_start_date)
);

-- 4. Medicare Device Calculation Ledger (Audit & Cost Reconciliation)
CREATE TABLE IF NOT EXISTS public.medicare_device_calculation_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id UUID NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    calc_line_id UUID NOT NULL REFERENCES public.medicare_base_rate_calc_lines(id) ON DELETE CASCADE,
    cpt_code VARCHAR(5) NOT NULL,
    payment_indicator VARCHAR(2) NOT NULL,
    is_device_intensive BOOLEAN NOT NULL,
    device_offset_percentage NUMERIC(5, 4) NOT NULL,
    device_offset_allowance NUMERIC(10, 2) NOT NULL,
    wage_adjusted_service_allowance NUMERIC(10, 2) NOT NULL,
    actual_device_acquisition_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    device_net_margin NUMERIC(10, 2) NOT NULL,
    calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_device_calc_line UNIQUE (calc_line_id)
);
```

---

## Business Rules
Document deterministic calculations, status transitions, validation rules, edge cases, and prohibited behaviors.

### Rule 1: Device Offset Isolation Formula
$$\text{Device Offset Amount} = \text{ROUND}(\text{National Rate} \times \text{Device Offset \%}, 2)$$
$$\text{Service Portion Unadjusted} = \text{National Rate} - \text{Device Offset Amount}$$
$$\text{Service Portion Adjusted} = (\text{Service Unadj} \times 0.50 \times \text{Wage Index}) + (\text{Service Unadj} \times 0.50)$$
$$\text{Total Authoritative Rate} = \text{Device Offset Amount} + \text{Service Portion Adjusted}$$

### Rule 2: ASCQR Quality Non-Compliance Carve-Out
$$\text{Total Penalized Rate} = \text{Device Offset Amount} + \text{ROUND}(\text{Service Portion Adjusted} \times 0.9800, 2)$$

### Rule 3: MPPR Secondary Procedure Device Protection
$$\text{Secondary J8 Payment} = \text{Device Offset Amount} + \text{ROUND}(\text{Service Portion Adjusted} \times 0.50, 2)$$

### Rule 4: Claim Scrubbing & C-Code Enforcement (`SCRUB-21`)
- For every surgical procedure with payment indicator `J8`, the claim **MUST** include at least one corresponding HCPCS C-code matching `cpt_device_category_crosswalk`.
- If missing, `SCRUB-21` raises a **FATAL PRE-BILL BLOCK**.

---

## Permissions / Security
Define who can view, create, edit, approve, export, and execute sensitive actions. AI tools must use the same permissions.

### Granular RBAC Permissions Catalog (`PERMISSIONS_CATALOG.device_intensive`)
- `device.view_offsets`: View CMS empirical device offset percentages and catalogs.
- `device.view_categories`: View statutory C-code category definitions.
- `device.view_crosswalk`: View CPT-to-device edit mappings.
- `device.edit_crosswalk`: Manage custom facility device mappings.
- `device.view_margin_ledger`: Access device offset vs vendor acquisition invoice variance.
- `device.override_offset`: Administrative override of empirical offset with audit trail.
- `device.audit_reconciliation`: Reconcile case device ledger against vendor invoices.
- `device.export_data`: Export device-intensive financial reports.

---

## API / Service Requirements
Define backend services, endpoints, jobs, imports, and tool contracts. Authoritative calculations must run server-side.

1. **RPC:** `public.fn_resolve_device_intensive_offset(p_cpt_code VARCHAR, p_dos DATE)` -> Returns statutory offset percentage and C-code requirements.
2. **RPC:** `public.fn_reconcile_device_margin(p_surgery_id UUID)` -> Calculates CMS device offset allowance versus extended invoice costs.
3. **Client Service:** `src/lib/medicareDeviceService.js` wired onto `db` singleton.

---

## UI / Workflow Requirements
Describe screens, states, filters, drill-downs, loading/empty/error states, and approval workflows.

1. **New Tab in `MedicareRateExplorer.jsx`:** "Device-Intensive Rules & C-Code Crosswalk".
2. **Interactive Calculator:** Shows 4-step explainability breakdown (National Base -> Protected Offset -> Net Service -> Adjusted Total).
3. **Variance Ledger Drawer:** Displays surplus/deficit on actual vendor invoice costs.
4. **Maestro Design Compliance:** Strict adherence to **Purple Ban** (slate `#0f172a`, blue `#2563eb`, emerald `#059669`, rose `#dc2626`).

---

## Audit / Provenance
Important changes and calculations must retain user, timestamp, source, before/after state, and calculation/version metadata.

1. **Release Provenance:** Every device offset record is foreign-keyed to `cms_asc_releases`.
2. **Immutability:** Calculation ledger entries in `medicare_device_calculation_ledgers` cannot be updated or deleted.
3. **Audit Triggers:** Deployed with `fn_audit_log_trigger` capturing user, timestamp, and metadata diffs.

---

## QA / Test Cases
Define unit, integration, RLS, financial, regression, and end-to-end tests required for this specification.

- Test suite: `tests/medicare-device-intensive-payment.test.js`
- Test 1: 42 CFR § 416.171(b)(2) formula precision across J8 procedures.
- Test 2: ASCQR 2.0% quality penalty applies strictly to service share.
- Test 3: MPPR 50% cut isolates service portion and preserves 100% of device offset.
- Test 4: C-code lines receive $0.00 allowable under indicator `N1`.
- Test 5: `SCRUB-21` raises fatal block if required C-code is missing.
- Test 6: Multi-tenant RLS isolation and negative authorization.
- Test 7: Static Purple Ban regex verification across all UI components.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes (`npx eslint src/`).
- Required tests pass (100% pass rate).
- No mock/placeholder values are presented as production truth.
- Gross chargemaster fallback is completely eliminated.
- Important numbers are reproducible from source data.
- P0/P1 issues block release.

---

## Dependencies
- Phase 60: Medicare ASC Base Rate Engine (`cms_asc_addenda`, `cms_asc_releases`).
- Phase 61: CMS Payment Indicators (`cms_payment_indicator_definitions`, `SCRUB-20` to `SCRUB-24`).
- Phase 62: Geographic Wage Adjustment (`facility_medicare_geographic_assignments`, `medicare_wage_indices`).
- Phase 55–59: Implant actuals and cost allocations (`case_devices`, `case_device_cost_allocations`).

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
Fill this section during development with exact files changed, migrations, blockers, and decisions.

- **Status:** Specification and read-only audit complete. 4 P1 release blockers identified in `PHASE_63_RISK_AND_BLOCKER_REGISTER.md`. Staged implementation pending user authorization.

