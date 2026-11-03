# PHASE 70 — DATA MODEL AND MIGRATION PLAN
## Target Relational Schemas, Proposed Migration 046 DDL, Canonical Column Mappings & Migration Strategy

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** DATA MODEL SPECIFICATION (PROPOSED / DESIGN-ONLY)  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** PostgreSQL Financial Metadata & Quality Assurance Schema  

---

## 1. MIGRATION GOVERNANCE NOTICE

In accordance with strict healthcare financial security governance:
- **Migration `046_financial_data_dictionary.sql` is strictly PROPOSED and DESIGN-ONLY.**
- **Zero database migrations or schema alterations are executed in Phase 70.**
- Upstream Migration 044 (`044_expected_reimbursement_engine.sql`) and proposed Migration 045 (`045_reimbursement_calculation_auditability.sql`) remain gated.

---

## 2. CANONICAL DATABASE FIELD MAPPING

The table below maps existing physical columns in the database to the target canonical financial dictionary terms:

| Existing Physical Column | Physical Table | Current Datatype | Target Canonical Financial Term | Migration / Refactor Action |
| :--- | :--- | :--- | :--- | :--- |
| `surgeries.gross_charge` | `public.surgeries` | `NUMERIC(12,2)` | `gross_billed_charges` | Map to canonical view / preserve for legacy |
| `surgeries.revenue` | `public.surgeries` | `NUMERIC(12,2)` | `expected_contractual_revenue` | Deprecate in favor of snapshot allowable |
| `surgeries.expected_reimbursement`| `public.surgeries` | `NUMERIC(12,2)` | `expected_contractual_allowable` | Deprecate in favor of `reimbursement_calculations` |
| `surgeries.supplies_cost` | `public.surgeries` | `NUMERIC(12,2)` | `direct_supply_cost` | Keep column; enforce non-implant supply scope |
| `surgeries.implants_cost` | `public.surgeries` | `NUMERIC(12,2)` | `implant_acquisition_cost` | Keep column; populate via `case_devices` sync |
| `surgeries.actual_room_cost` | `public.surgeries` | `NUMERIC(12,2)` | `direct_or_time_cost` | Re-derive server-side via `operating_rooms.hourly_rate` |
| `surgeries.actual_labor_cost` | `public.surgeries` | `NUMERIC(12,2)` | `direct_clinical_labor_cost` | Re-derive server-side via `case_staff_assignments` |
| `surgery_procedures.gross_charge`| `public.surgery_procedures`| `NUMERIC(12,2)`| `line_gross_charge` | Keep column; matches CPT Chargemaster |
| `reimbursement_calculations.total_contract_allowable`| `public.reimbursement_calculations`| `NUMERIC(12,2)`| `contract_total_allowable` | Canonical source of truth for case allowable |
| `reimbursement_calculations.expected_contribution_margin`| `public.reimbursement_calculations`| `NUMERIC(12,2)`| `expected_contribution_margin` | Canonical source of truth for contribution margin |

---

## 3. PROPOSED MIGRATION 046 DDL (DESIGN-ONLY)

```sql
-- ==============================================================================
-- PROPOSED MIGRATION: 046_financial_data_dictionary.sql
-- STATUS: DESIGN-ONLY / UNAUTHORIZED FOR RUNTIME EXECUTION
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Financial Metric Definitions Catalog
CREATE TABLE IF NOT EXISTS public.financial_metric_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_code VARCHAR(64) NOT NULL UNIQUE,
    canonical_name VARCHAR(128) NOT NULL,
    financial_category VARCHAR(32) NOT NULL CHECK (financial_category IN ('CHARGE', 'REVENUE', 'PAYMENT', 'COST', 'MARGIN', 'ADJUSTMENT', 'METRIC', 'QUALITY')),
    storage_datatype VARCHAR(32) NOT NULL DEFAULT 'NUMERIC(12,2)',
    source_table VARCHAR(64) NOT NULL,
    source_column VARCHAR(64) NOT NULL,
    business_definition TEXT NOT NULL,
    technical_definition TEXT NOT NULL,
    accounting_treatment VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Versioned Financial Formula Registry
CREATE TABLE IF NOT EXISTS public.financial_formula_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    formula_code VARCHAR(64) NOT NULL,
    version_number VARCHAR(16) NOT NULL,
    metric_id UUID NOT NULL REFERENCES public.financial_metric_definitions(id) ON DELETE RESTRICT,
    formula_expression TEXT NOT NULL,
    rounding_method VARCHAR(32) NOT NULL DEFAULT 'ROUND_HALF_UP',
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(formula_code, version_number)
);

-- 3. Case Financial Reconciliations Ledger
CREATE TABLE IF NOT EXISTS public.case_financial_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    calculation_id UUID REFERENCES public.reimbursement_calculations(id),
    contract_total_allowable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_payer_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    patient_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    contractual_adjustments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    underpayment_variance NUMERIC(12,2) GENERATED ALWAYS AS (contract_total_allowable - (gross_payer_payments + patient_payments + contractual_adjustments)) STORED,
    completeness_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security & Indices
ALTER TABLE public.financial_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_formula_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_financial_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reconciliations_facility ON public.case_financial_reconciliations(facility_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_surgery ON public.case_financial_reconciliations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON public.case_financial_reconciliations(completeness_status);
```

---

## 4. MIGRATION ROLLBACK STRATEGY (`046_down.sql`)

A paired down-migration ensures clean reversibility:
```sql
DROP TABLE IF EXISTS public.case_financial_reconciliations CASCADE;
DROP TABLE IF EXISTS public.financial_formula_registry CASCADE;
DROP TABLE IF EXISTS public.financial_metric_definitions CASCADE;
```
