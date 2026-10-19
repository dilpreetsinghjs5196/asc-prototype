# 32 CASE CPT CODES SPECIFICATION

## Purpose
Case CPT lines, units, modifiers, laterality, sequence, coding status, fee schedule resolution, and provenance.

## Scope
- Define production-grade 1NF normalized procedure line items for all surgical cases.
- Support up to 4 billing modifiers per line (CMS-1500 / 837P standard).
- Support procedure units (1–99) with deterministic charge and reimbursement multiplication.
- Support anatomical laterality (`LEFT`, `RIGHT`, `BILATERAL`, `NOT_APPLICABLE`, `UNSPECIFIED`).
- Preserve dual-write backward compatibility with legacy `surgeries.cpt_codes` arrays.
- Support Bilateral Modifier 50 reimbursement logic (150% allowable).
- Support Add-on codes (`+`) and distinct procedural services (`59`, `XE`, `XP`, `XS`, `XU`).
- Enforce multi-tenant facility isolation and HIPAA audit logging.

## Current State vs Target State
### Current State
- `public.cpt_codes` stores national and facility-specific CPT catalog items.
- `public.surgeries` stores an unnormalized array of string codes in `cpt_codes` and expense JSON in `cpt_expenses`.
- `public.surgery_procedures` table exists from Migration 002 but lacks:
  - `units`
  - Multi-modifier array (`modifiers[]`)
  - `laterality`
  - `coding_status`
  - Line-level provenance (`coded_by`, `coded_at`, `verified_by`, `verified_at`)
  - UI synchronization (the frontend scheduler currently writes only to `surgeries.cpt_codes`).

### Target State
- Every surgery case has 1NF procedure rows in `public.surgery_procedures`.
- Each procedure line tracks:
  - Sequence rank (Rank 1 = Primary procedure)
  - Units (quantity multiplier for charges and allowable reimbursement)
  - Modifiers array (e.g., `['RT', '59']` or `['50']`)
  - Laterality designation
  - Coding lifecycle status (`Draft`, `Pending_Review`, `Coded`, `Approved`, `Rejected`)
  - Line charges, contracted rates, and fee schedule links
  - User provenance
- The UI scheduler provides a procedure line editor and synchronizes both `surgery_procedures` and legacy `surgeries.cpt_codes`.

## Data Model / Schema (Migration 010)

```sql
ALTER TABLE public.surgery_procedures
    ADD COLUMN IF NOT EXISTS units INTEGER NOT NULL DEFAULT 1 CHECK (units >= 1 AND units <= 99),
    ADD COLUMN IF NOT EXISTS modifiers TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS laterality TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (laterality IN ('LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE', 'UNSPECIFIED')),
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS procedure_description TEXT,
    ADD COLUMN IF NOT EXISTS coding_status TEXT NOT NULL DEFAULT 'Coded'
        CHECK (coding_status IN ('Draft', 'Pending_Review', 'Coded', 'Approved', 'Rejected')),
    ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS source_line_id TEXT,
    ADD COLUMN IF NOT EXISTS fee_schedule_id UUID REFERENCES public.payer_fee_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS line_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS line_expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS coded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS coded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_surgery_proc_status ON public.surgery_procedures(facility_id, coding_status);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_fee_sched ON public.surgery_procedures(fee_schedule_id);
```

## Business Rules & Calculations

1. **Units Multiplier**:
   - `Line Gross Charge = baseline_charge * units`
   - `Line Allowable Reimbursement = contracted_rate * units`
2. **Primary Procedure Designation**:
   - `sequence_rank = 1` designates the primary surgical procedure.
   - Exactly one procedure per case must be flagged as primary (`is_primary = true`).
3. **Bilateral Procedure 50 Rule (Modifier 50)**:
   - If modifier `'50'` is present or `laterality = 'BILATERAL'`, the allowable reimbursement is calculated at **150%** of the standard allowable rate per ASC CMS billing guidelines.
4. **MPPR (Multiple Procedure Payment Reduction)**:
   - When enabled:
     - Rank 1 (Primary): 100% allowable.
     - Rank > 1 (Secondary): 50% allowable.
     - Add-on codes (`+`) or exempt codes: 100% allowable (exempt from reduction).
5. **Coding Status Lifecycle**:
   - Transitions: `Draft` → `Pending_Review` → `Coded` → `Approved`.
   - Cases marked `Completed` or `Billed` lock procedure line items from non-admin modification.

## Permissions & RBAC
- **View Procedures**: All authenticated staff with `surgeries.view` or clinical roles.
- **Add / Edit Procedure Lines**: `super_admin`, `org_admin`, `facility_admin`, `clinical_director`, `biller`, and attending `surgeon` (own cases).
- **Approve Coding**: `super_admin`, `facility_admin`, `biller`.

## Dependencies
- Upstream: Phase 30 (`apply_medicare_mppr` setting in Migration 008/001).
- Upstream: Phase 31 (Case Master Normalization in Migration 009).

## Migration / Rollback Plan
- **Forward Migration**: `supabase/migrations/010_case_cpt_codes_normalization.sql`
  - Adds `units`, `modifiers`, `laterality`, `is_primary`, `coding_status`, `line_gross_charge`, `line_expected_reimbursement`, and audit columns to `public.surgery_procedures`.
  - Enforces check constraints (`chk_surgery_proc_units`, `chk_surgery_proc_laterality`, `chk_surgery_proc_coding_status`).
  - Performs idempotent backfill from `surgeries.cpt_codes`.
  - Updates `calculate_surgery_financials` RPC with units multiplier and bilateral 50 calculation.
  - Hardens tenant-scoped RLS policies.
- **Rollback Plan**: `supabase/migrations/010_case_cpt_codes_normalization_down.sql`
  - Drops added columns, constraints, and restored RPC definition to pre-010 state.

