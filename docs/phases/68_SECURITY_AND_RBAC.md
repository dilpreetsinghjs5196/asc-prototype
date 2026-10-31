# PHASE 68 — SECURITY AND RBAC SPECIFICATION
## Multi-Tenant Security, Role-Based Access Control & AI Analyst Governance

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Application Security Architect, Senior Database Administrator  
> **Status:** SECURITY ARCHITECTURE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  

---

## 1. ACCESS CONTROL MATRIX (RBAC)

The Expected Reimbursement Engine governs sensitive financial reimbursement, contractual pricing, and margin calculations. Access is enforced across 8 granular permissions:

| Permission String | Description | Minimum Role |
| :--- | :--- | :--- |
| `reimbursement.calculation.view` | View encounter summary reimbursement figures | `viewer` |
| `reimbursement.explanation.view` | View line-level calculation traces & intermediate math | `biller` |
| `reimbursement.calculation.execute` | Trigger initial calculation on an encounter | `biller` |
| `reimbursement.calculation.recalculate`| Trigger a recalculation with mandatory reason | `biller` |
| `reimbursement.calculation.approve` | Formally accept calculation as authoritative for billing | `facility_admin` |
| `reimbursement.snapshot.view` | Inspect historical snapshots & cryptographic hashes | `biller` |
| `reimbursement.report.export` | Export reimbursement summaries to CSV / PDF | `facility_admin` |
| `reimbursement.config.manage` | Configure global calculation defaults & tolerances | `super_admin` |

---

## 2. ROLE MAPPING

| Role | Permitted Actions | Excluded Actions |
| :--- | :--- | :--- |
| **`super_admin`** | Full access across all organizations and facilities | None |
| **`org_admin`** | Full access within assigned organization | Global platform config |
| **`facility_admin`** | Calculate, recalculate, approve, view traces, export | Cross-facility access |
| **`biller` / `coder`** | Calculate, recalculate, view traces, view snapshots | Final financial approval, export |
| **`clinical_director`** | View case summaries, view contribution margins | Rate editing, recalculation |
| **`surgeon`** | View procedure allowable & personal case margin | Cross-surgeon pricing, contracts |
| **`auditor`** | Read-only inspection of snapshots, hashes, & logs | Any calculation or modification |

---

## 3. ROW-LEVEL SECURITY (RLS) POLICIES

All reimbursement calculation tables (`reimbursement_calculations`, `reimbursement_calculation_lines`, `reimbursement_calculation_adjustments`) have RLS enabled and strictly enforce multi-facility tenancy:

```sql
ALTER TABLE public.reimbursement_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_calculation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_calculation_adjustments ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: User must have facility access
CREATE POLICY "Tenant Accessible Calculations Read"
ON public.reimbursement_calculations
FOR SELECT
TO authenticated
USING (
    public.is_facility_accessible(facility_id)
);

CREATE POLICY "Tenant Accessible Calculation Lines Read"
ON public.reimbursement_calculation_lines
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.reimbursement_calculations rc
        WHERE rc.id = reimbursement_calculation_lines.calculation_id
          AND public.is_facility_accessible(rc.facility_id)
    )
);

-- 2. INSERT Policy: Only authorized roles via server-side functions
CREATE POLICY "Authorized Roles Insert Calculations"
ON public.reimbursement_calculations
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_facility_accessible(facility_id)
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'coder'])
);

-- 3. STRICTLY NO UPDATE OR DELETE POLICIES ARE GRANTED
-- In addition to database triggers, omitting UPDATE and DELETE policies ensures
-- that client applications cannot mutate or delete calculation ledger records.
```

---

## 4. DEFENSE-IN-DEPTH: EXPLICIT DCL GRANTS

To prevent authorization bypass:
1. `REVOKE ALL ON public.reimbursement_calculations FROM anon;`
2. `REVOKE ALL ON public.reimbursement_calculation_lines FROM anon;`
3. `REVOKE UPDATE, DELETE ON public.reimbursement_calculations FROM authenticated;`
4. `REVOKE UPDATE, DELETE ON public.reimbursement_calculation_lines FROM authenticated;`
5. `GRANT SELECT, INSERT ON public.reimbursement_calculations TO authenticated;`
6. `GRANT SELECT, INSERT ON public.reimbursement_calculation_lines TO authenticated;`

---

## 5. AI ANALYST & AGENT GOVERNANCE BOUNDARIES

The ASCANALYST AI Ops Assistant is subject to strict security boundaries:
1. **No Independent Financial Arithmetic:** The AI Analyst is **strictly blocked** from calculating expected reimbursement, guessing contractual discounts, or estimating allowable amounts in LLM generation.
2. **Authoritative Trace Reading Only:** The AI Analyst may only read and explain existing calculation records persisted in `public.reimbursement_calculations` and `public.reimbursement_calculation_lines`.
3. **Tenancy Sandboxing:** All AI database tool executions execute within the authenticated user's session context. The AI cannot query calculations belonging to facilities the requesting user is not authorized to access.
4. **Honest Explanations:** When a calculation is in `PARTIALLY_CALCULATED`, `CONTRACT_NOT_FOUND`, or `RATE_NOT_FOUND` status, the AI must explicitly state that contracted rates are missing, and must **never** present hypothetical estimates as approved truth.

