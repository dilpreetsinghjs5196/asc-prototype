# 64 MULTIPLE PROCEDURE PAYMENT RULES

## Purpose
Multiple procedure and related reimbursement reduction logic for ASC encounters.

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
| **`cms_asc_addenda`** | `supabase/migrations/036_medicare_asc_base_rate_engine.sql` | **KEEP** | Authoritative source of national unadjusted rates and payment indicators. |
| **`cms_payment_indicators`** | `supabase/migrations/037_cms_payment_indicators_and_interpretation.sql` | **KEEP** | Authoritative reference defining `is_mppr_eligible` (`A2`, `G2`, `P2`, `P3`, `J8` = true; `Z2`, `K2`, `N1` = false). |
| **`facility_medicare_settings`** | `supabase/migrations/036_medicare_asc_base_rate_engine.sql` | **KEEP** | Preserves CBSA code and facility-level Medicare configuration. |
| **`facilities.apply_medicare_mppr`** | `supabase/migrations/001_multi_tenancy_core.sql` | **KEEP** | Facility-level boolean toggle controlling whether Medicare MPPR is active; wired to Settings UI and RBAC. |
| **`cpt_billing_rules`** | `supabase/migrations/021_cpt_modifiers_units_laterality.sql` | **KEEP** | Preserves `is_mppr_exempt` and `bilateral_indicator`. |
| **`medicareDeviceService.js`** | `src/lib/medicareDeviceService.js` | **KEEP** | Phase 63 service protecting J8 device offset from MPPR reduction (42 CFR § 416.171(b)(2)). |
| **Claim Scrubber SCRUB-18** | `supabase/migrations/024_claim_scrubbing_rules.sql` | **KEEP & REFACTOR** | Checks line sequencing for MPPR, but lacks validation for bilateral units and commercial modifier 51 rules. |
| **`calculateMedicareRevenue`** | `src/utils/hospitalUtils.js:118` | **REFACTOR** | Client-side sorting and reduction. Lacks server-side audit snapshot; falls back to gross charges if rates missing. |
| **`calculateAuthoritativeAscRevenue`** | `src/utils/hospitalUtils.js:636` | **REPLACE** | Duplicate client-side function that cuts whole lines by 50% without protecting J8 device offsets. |
| **`calculate_surgery_financials`** | `supabase/migrations/022_cpt_versioning_and_licensed_content.sql` | **REFACTOR** | Applies 50% cut without recording line-by-line reduction provenance or endoscopy base-code logic. |
| **`multiple_procedure_rule_sets`** | Target Migration 040 | **MISSING** | Dedicated table for Medicare and commercial payer multiple procedure discount cascades. |
| **`multiple_procedure_rules`** | Target Migration 040 | **MISSING** | Tiered reduction percentages (Tier 1 = 100%, Tier 2 = 50%, Tier 3 = 25%, etc.). |
| **`cms_endoscopy_families`** | Target Migration 040 | **MISSING** | CMS Endoscopy base-code difference lookup table under 42 CFR § 416.172(c). |
| **`mppr_calculation_snapshots`** | Target Migration 040 | **MISSING** | Immutable encounter-level financial audit snapshot. |
| **`mppr_calculation_lines`** | Target Migration 040 | **MISSING** | Line-item calculation audit recording rank, pre-cut allowable, reduction %, and final allowable. |

---

## Target State
Describe the production-ready target behavior, data model, services, user experience, permissions, and integrations.

1. **Statutory Methodology**: Strict adherence to **42 CFR § 416.172**. When more than one surgical procedure is performed in a single operating session, Medicare pays 100% of the allowable amount for the procedure with the highest payment rate, and 50% of the allowable amount for each additional surgical procedure.
2. **Device Offset Protection Invariant**: Under 42 CFR § 416.171(b)(2) and § 416.172, on secondary device-intensive (`J8`) procedures, the 50% reduction applies **strictly to the wage-adjusted service portion**. The device offset amount is **100% protected** and paid in full.
3. **Endoscopy Family Base-Code Deduction**: Under 42 CFR § 416.172(c), multiple endoscopies within the same family are reimbursed at the difference between the member rate and the base code rate, not a flat 50% cut.
4. **Bilateral Procedure Integration**: Modifier 50 receives 150% standard allowable on a single line (Side 1 at 100% + Side 2 at 50%).
5. **Add-On & Ancillary Exemptions**: Add-on codes (`+`) and covered ancillary services (`Z2` radiology, `K2` drugs) are statutorily exempt from MPPR reductions across all units.
6. **Packaged Code Exclusion**: Packaged codes (`N1`) receive $0.00 separate allowable and are excluded from ranking.
7. **Commercial Payer Cascades**: Configurable multi-tier discount schedules (100% / 50% / 25% / 0%) with mandatory Modifier 51 validation on commercial claims.
8. **Server-Side Authoritative Resolution**: Elimination of competing client functions. All encounter calculations are executed via PostgreSQL RPC `fn_calculate_mppr_reimbursement`.

---

## Data Model / Schema
List required tables, columns, indexes, foreign keys, effective dates, provenance, and migration requirements.

### Target Migration: `040_multiple_procedure_payment_rules.sql` (Planning Reference Only)

```sql
-- 1. Multiple Procedure Rule Sets (Medicare ASC & Commercial Payer Cascades)
CREATE TABLE IF NOT EXISTS public.multiple_procedure_rule_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payers(id) ON DELETE CASCADE,
    rule_set_code VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    payment_system VARCHAR(30) NOT NULL CHECK (payment_system IN ('Medicare_ASC', 'Commercial', 'Medicaid', 'WorkerComp')),
    ranking_metric VARCHAR(30) NOT NULL DEFAULT 'ALLOWABLE_DESC' CHECK (ranking_metric IN ('ALLOWABLE_DESC', 'GROSS_CHARGE_DESC', 'RVU_DESC')),
    protect_device_offset BOOLEAN NOT NULL DEFAULT true,
    exempt_add_on_codes BOOLEAN NOT NULL DEFAULT true,
    exempt_ancillary_codes BOOLEAN NOT NULL DEFAULT true,
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_code_facility UNIQUE (rule_set_code, facility_id, effective_start_date)
);

-- 2. Tiered Reduction Rules by Rank
CREATE TABLE IF NOT EXISTS public.multiple_procedure_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_set_id UUID NOT NULL REFERENCES public.multiple_procedure_rule_sets(id) ON DELETE CASCADE,
    tier_rank INTEGER NOT NULL CHECK (tier_rank >= 1),
    multiplier_percentage NUMERIC(5, 4) NOT NULL CHECK (multiplier_percentage BETWEEN 0.0000 AND 2.0000),
    subsequent_units_multiplier NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
    applies_to_device BOOLEAN NOT NULL DEFAULT false,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_tier UNIQUE (rule_set_id, tier_rank)
);

-- 3. CMS Endoscopy Families (Base-Code Difference Lookup)
CREATE TABLE IF NOT EXISTS public.cms_endoscopy_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id INTEGER NOT NULL,
    family_name VARCHAR(150) NOT NULL,
    member_cpt_code VARCHAR(5) NOT NULL,
    base_cpt_code VARCHAR(5) NOT NULL,
    effective_year INTEGER NOT NULL DEFAULT 2026,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_endoscopy_member_year UNIQUE (member_cpt_code, effective_year)
);

-- 4. MPPR Calculation Header Snapshots (Financial Audit Trail)
CREATE TABLE IF NOT EXISTS public.mppr_calculation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL,
    rule_set_id UUID NOT NULL REFERENCES public.multiple_procedure_rule_sets(id) ON DELETE RESTRICT,
    calculation_version VARCHAR(20) NOT NULL DEFAULT 'CY2026_V1',
    total_procedure_lines INTEGER NOT NULL,
    total_gross_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_unreduced_allowable NUMERIC(12, 2) NOT NULL,
    total_mppr_savings NUMERIC(12, 2) NOT NULL,
    total_final_allowable NUMERIC(12, 2) NOT NULL,
    is_ascqr_compliant BOOLEAN NOT NULL DEFAULT true,
    calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. MPPR Line-Item Breakdown Snapshots
CREATE TABLE IF NOT EXISTS public.mppr_calculation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES public.mppr_calculation_snapshots(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    cpt_code VARCHAR(5) NOT NULL,
    modifiers VARCHAR(10)[] NOT NULL DEFAULT '{}',
    payment_indicator VARCHAR(2) NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    initial_unadjusted_rate NUMERIC(10, 2) NOT NULL,
    device_offset_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    wage_adjusted_service_share NUMERIC(10, 2) NOT NULL,
    rank_order INTEGER NOT NULL,
    reduction_multiplier NUMERIC(5, 4) NOT NULL,
    reduced_service_share NUMERIC(10, 2) NOT NULL,
    final_line_allowable NUMERIC(10, 2) NOT NULL,
    reduction_discount_amount NUMERIC(10, 2) NOT NULL,
    reduction_rationale TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_snapshot_line UNIQUE (snapshot_id, line_number)
);
```

---

## Business Rules
Document deterministic calculations, status transitions, validation rules, edge cases, and prohibited behaviors.

1. **Ranking Metric Invariant**: Procedures must be ranked strictly by single-unit allowable rate descending. Gross chargemaster charges shall NEVER determine rank order.
2. **Device Offset Protection**: For secondary `J8` procedures, $\text{Secondary Payment} = \text{Device Offset} + \text{ROUND}(\text{Service Share} \times 0.50, 2)$.
3. **ASCQR Quality Penalty**: If non-compliant, 2.0% reduction factor (`0.9800`) applies to service share before MPPR halving. Device offset is 100% exempt.
4. **Bilateral Rule**: Modifier 50 allowable = $\text{Single Allowable} \times 1.50$ on 1 line. Units > 1 trigger error `BILAT-001`.
5. **Modifier 51 Scrubber Rule**: Commercial claims require modifier 51 on secondary lines. Medicare claims reject modifier 51.
6. **Packaged Code Exclusion**: Codes with indicator `N1` receive $0.00 and are never entered into ranking.
7. **Add-On Exemption**: CPT codes with `+` receive 100% allowable across all units.

---

## Permissions / Security
Define who can view, create, edit, approve, export, and execute sensitive actions. AI tools must use the same permissions.

- `mppr.view_rules`: View facility and payer MPPR configurations.
- `mppr.view_calculations`: View line-by-line MPPR breakdown on encounters.
- `mppr.manage_payer_rules`: Author or edit commercial payer discount cascades.
- `mppr.toggle_facility_setting`: Toggle facility-level Medicare MPPR activation.
- `mppr.override_discount`: Request or apply manual override on reduced lines.
- `mppr.approve_override`: Executive sign-off for billing exceptions.
- `mppr.audit_export`: Export MPPR financial impact and discount reports.

---

## API / Service Requirements
Define backend services, endpoints, jobs, imports, and tool contracts. Authoritative calculations must run server-side.

- `public.fn_calculate_mppr_reimbursement`: Authoritative server RPC calculating multi-line encounter reimbursement.
- `public.fn_resolve_mppr_rules`: Resolves applicable rule set for a payer/facility.
- Client Service: `src/lib/mpprService.js` bound to `db` singleton.
- Deprecate `calculateAuthoritativeAscRevenue` in `src/utils/hospitalUtils.js`.

---

## UI / Workflow Requirements
Describe screens, states, filters, drill-downs, loading/empty/error states, and approval workflows.

- **Tab 7 in MedicareRateExplorer.jsx**: Dedicated Multiple Procedure Rules (MPPR) workbench.
- **Interactive Multi-Line Simulator**: Add procedure lines, pick CPT codes, select modifiers, toggle bilateral, toggle ASCQR, and view real-time rank order and discounts.
- **Rule Sets & Cascades Catalog**: View Medicare ASC 100/50 statutory rules alongside commercial cascades.
- **Endoscopy Family Browser**: Search endoscopy base codes and verify base-code difference deductions.
- **Case Audit Drill-Down**: Inspect historical case snapshots with before/after deduction comparisons.

---

## Audit / Provenance
Important changes and calculations must retain user, timestamp, source, before/after state, and calculation/version metadata.

- `mppr_calculation_snapshots` and `mppr_calculation_lines` retain full provenance.
- Immutability trigger `trg_block_mppr_snapshot_modification` blocks `UPDATE` and `DELETE` on financial records.

---

## QA / Test Cases
Define unit, integration, RLS, financial, regression, and end-to-end tests required for this specification.

- Standard dual-surgical 100%/50% reduction test.
- Secondary J8 device offset 100% protection test.
- Endoscopy family base-code deduction test.
- Bilateral modifier 50 single-line 150% allowable test.
- Add-on code (+) 100% exemption test.
- Packaged code (N1) $0.00 exclusion test.
- Commercial 4-tier cascade test.
- Gross charge exclusion from ranking test.
- Multi-tenant RLS isolation test.
- Maestro Purple Ban static audit.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes (`npx eslint`).
- All unit and regression tests pass (`npm test`).
- No mock/placeholder values are presented as production truth.
- Tenant isolation verified.
- P0/P1 issues block release.

---

## Dependencies
- Phase 60 (Base Rate Engine): `cms_asc_addenda`, `facility_medicare_settings`.
- Phase 61 (Payment Indicators): `cms_payment_indicators`.
- Phase 62 (Geographic Wage Adjustment): `fn_resolve_facility_wage_index`.
- Phase 63 (Device-Intensive Rules): `fn_resolve_device_intensive_offset`, `cms_device_categories`.

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
Audit and specification completed. Deliverables produced in `docs/phases/PHASE_64_*.md`. Release verdict: **CONDITIONAL GO** pending remediation of duplicate client functions.
