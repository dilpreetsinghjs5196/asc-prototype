# PHASE 67 — SECURITY AND RBAC MATRIX
## Tenancy, Permissions, Row-Level Security, and Audit Governance

> **Module:** Commercial Rate Rules & Financial Adjudication Engine  
> **Target Migration:** `043_payer_contract_rate_rules.sql` (Planning Reference Only)  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY AUDIT STAGE  
> **Upstream Dependencies:** Phases 60–66 Verified

---

## 1. Security Architecture & Principles

Financial fee schedules, multiplier terms, and contractual carve-outs represent the most commercially sensitive proprietary data in an ASC. Unauthorized disclosure or accidental cross-facility contamination violates non-disclosure agreements with major payers, invites severe antitrust scrutiny, and breaches HIPAA/HITECH administrative safeguards.

### Core Security Mandates:
1. **Multi-Tenant Isolation:** Users can only view or adjudicate rates belonging to facilities in their active session scope (`public.is_facility_accessible(facility_id)`).
2. **Separation of Duties (SoD):** The individual who stages or edits a commercial fee schedule cannot approve or activate it. Rate activation requires authorized CFO or Managed Care Director sign-off.
3. **No Direct `user_roles` Queries:** RLS policies must strictly call canonical helper functions `public.is_facility_accessible()` and `public.user_has_facility_role()`. Direct table access to `public.user_roles` is strictly forbidden.
4. **Permanent Audit Immutability:** Historical calculation snapshots in `payer_contract_rate_calculations` are read-only (`SELECT` only). `UPDATE` and `DELETE` operations are completely disabled via RLS and triggers.

---

## 2. Fine-Grained Permissions Registry (`payer.rate.*`)

Phase 67 defines 14 specific permissions governing rate schedules, bundled packages, carve-outs, and adjudication:

| Permission Code | Name | Description |
|:---|:---|:---|
| `payer.rate.view` | View Rate Schedules | View contracted CPT fee schedules, case rates, and multipliers |
| `payer.rate.history.view` | View Rate History | View superseded historical rate exhibits and version changes |
| `payer.rate.create` | Create Rate Exhibit | Create new draft fee schedules or rate packages |
| `payer.rate.edit` | Edit Rate Exhibit | Modify draft CPT lines, multipliers, and discounts |
| `payer.rate.delete` | Delete Draft Rates | Remove unapproved draft rate schedules |
| `payer.rate.import` | Bulk Import Rates | Upload CSV/Excel fee schedules into staging tables |
| `payer.rate.export` | Export Rate Schedules | Download encrypted rate exhibits for financial analysis |
| `payer.rate.caserate.manage` | Manage Case Rates | Configure bundled surgical packages and inclusions |
| `payer.rate.carveout.manage` | Manage Carve-Outs | Configure implant carve-out rules, thresholds, and markups |
| `payer.rate.exception.manage`| Manage Exceptions | Configure stop-loss triggers, floors, and unlisted overrides |
| `payer.rate.calculate` | Execute Adjudication | Run server-side reimbursement calculation on cases |
| `payer.rate.override` | Manual Override | Apply an authorized manual rate adjustment to a claim |
| `payer.rate.approve` | Approve Rate Schedule | Executive sign-off locking and activating a rate exhibit |
| `payer.rate.audit` | View Audit Ledger | Access immutable calculation snapshots and cryptographic hashes |

---

## 3. Role-Based Access Control (RBAC) Matrix

The table below specifies permission grants across standard ASC system roles:

| Role | `rate.view` | `rate.edit` | `rate.import` | `rate.caserate` | `rate.carveout` | `rate.calc` | `rate.override` | `rate.approve` | `rate.audit` |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Organization CFO** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Managed Care Director** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Facility Administrator** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Billing / Revenue Specialist** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Contracting Analyst** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Coding Specialist** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Clinical Staff / OR Nurse** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **External Compliance Auditor** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 4. Production Row-Level Security (RLS) Policies

Every rate and calculation entity is protected by RLS. Below are the canonical policy specifications:

```sql
-- Enable RLS across all Phase 67 entities
ALTER TABLE public.payer_contract_rate_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_cpt_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_case_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_case_rate_inclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_carve_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_calculation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_import_staging ENABLE ROW LEVEL SECURITY;

-- 1. Rate Schedules Access (Governed by parent contract version -> contract -> facility)
CREATE POLICY "rate_schedules_select_policy"
ON public.payer_contract_rate_schedules
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_rate_schedules.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

CREATE POLICY "rate_schedules_modify_policy"
ON public.payer_contract_rate_schedules
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_rate_schedules.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
          AND public.user_has_facility_role(c.facility_id, ARRAY['super_admin', 'org_admin', 'managed_care_director'])
    )
);

-- 2. CPT Rates Access (Inherited from rate schedule)
CREATE POLICY "cpt_rates_select_policy"
ON public.payer_contract_cpt_rates
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_cpt_rates.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 3. Calculations Snapshot Header (Read-Only to Authorized Billing / Admin)
CREATE POLICY "calculations_select_policy"
ON public.payer_contract_rate_calculations
FOR SELECT
TO authenticated
USING (
    public.is_facility_accessible(facility_id)
);

CREATE POLICY "calculations_insert_policy"
ON public.payer_contract_rate_calculations
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_facility_accessible(facility_id)
);

-- NOTE: NO UPDATE OR DELETE POLICIES EXIST FOR CALCULATIONS (IMMUTABLE BY DESIGN)

-- 4. Calculation Lines (Inherited from header)
CREATE POLICY "calc_lines_select_policy"
ON public.payer_contract_rate_calculation_lines
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_rate_calculations calc
        WHERE calc.id = payer_contract_rate_calculation_lines.calculation_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);
```

---

## 5. Audit Logging & Provenance Tracking

1. **Cryptographic SHA-256 Hash Chain:**
   Each row in `payer_contract_rate_calculations` computes:
   $$\text{calculation\_hash} = \text{SHA256}(\text{case\_id} \,\|\, \text{contract\_version\_id} \,\|\, \text{date\_of\_service} \,\|\, \text{total\_allowable} \,\|\, \text{calculated\_by})$$
2. **Tamper Detection:**
   A nightly verification job verifies that `calculation_hash` matches current database values. If any manual database manipulation has occurred, an immediate security alert is triggered.
3. **Traceability:**
   Every rate calculation records the exact user ID (`auth.uid()`), timestamp, client IP, and complete mathematical intermediate trace string in `payer_contract_rate_calculation_lines.calculation_trace`.

