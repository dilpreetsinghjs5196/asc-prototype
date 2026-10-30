# PHASE 64 — DATA MODEL AND API DESIGN
## Schema DDL, Stored Procedure Contracts, and Client Service Architecture

**Status**: Production Architecture Design (Planning Reference)  
**Proposed Migration**: `040_multiple_procedure_payment_rules.sql` (NOT to be executed or created during audit)  
**Auditing Mode**: Specification & DDL Blueprint Only

---

## 1. Schema Evaluation & Table Specifications

To achieve deterministic calculation and immutable audit trails without redundant duplication of Phase 60–63 data, Phase 64 defines five targeted tables:

```
                               ┌─────────────────────────────┐
                               │   public.payers (Phase 2)   │
                               └──────────────┬──────────────┘
                                              │ (1:N)
                                              ▼
┌──────────────────────────────┐       ┌─────────────────────────────┐
│  cms_endoscopy_families      │       │ multiple_procedure_rule_sets│
│  (CMS Base-Code Crosswalk)   │       │ (Rule Set Definitions)      │
└──────────────────────────────┘       └──────────────┬──────────────┘
                                                      │ (1:N)
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │  multiple_procedure_rules   │
                                       │  (Tiered Multipliers & Caps)│
                                       └─────────────────────────────┘

┌──────────────────────────────┐       ┌─────────────────────────────┐
│  public.surgeries (Cases)    ├──────►│  mppr_calculation_snapshots │
└──────────────────────────────┘ (1:N) │  (Header Financial Audit)   │
                                       └──────────────┬──────────────┘
                                                      │ (1:N)
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │   mppr_calculation_lines    │
                                       │   (Line-Item Calculation)   │
                                       └─────────────────────────────┘
```

---

### Table 1: `public.multiple_procedure_rule_sets`
Defines named rulesets (e.g., Medicare ASC Statutory, Commercial Standard 100/50/25/0).

```sql
CREATE TABLE IF NOT EXISTS public.multiple_procedure_rule_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Reference
    payer_id UUID REFERENCES public.payers(id) ON DELETE CASCADE,       -- NULL = Default for Payment System
    rule_set_code VARCHAR(30) NOT NULL,                                  -- e.g., 'MEDICARE_ASC_416_172', 'COM_STD_CASCADE'
    name VARCHAR(150) NOT NULL,
    payment_system VARCHAR(30) NOT NULL CHECK (payment_system IN ('Medicare_ASC', 'Commercial', 'Medicaid', 'WorkerComp')),
    ranking_metric VARCHAR(30) NOT NULL DEFAULT 'ALLOWABLE_DESC' CHECK (ranking_metric IN ('ALLOWABLE_DESC', 'GROSS_CHARGE_DESC', 'RVU_DESC')),
    protect_device_offset BOOLEAN NOT NULL DEFAULT true,                -- Statutory J8 protection
    exempt_add_on_codes BOOLEAN NOT NULL DEFAULT true,                  -- + codes exempt from discount
    exempt_ancillary_codes BOOLEAN NOT NULL DEFAULT true,               -- Z2, K2 exempt from discount
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_code_facility UNIQUE (rule_set_code, facility_id, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_mppr_rule_sets_lookup 
    ON public.multiple_procedure_rule_sets(payment_system, payer_id, is_active);
```

---

### Table 2: `public.multiple_procedure_rules`
Defines tiered reduction percentages by procedure rank order.

```sql
CREATE TABLE IF NOT EXISTS public.multiple_procedure_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_set_id UUID NOT NULL REFERENCES public.multiple_procedure_rule_sets(id) ON DELETE CASCADE,
    tier_rank INTEGER NOT NULL CHECK (tier_rank >= 1),                  -- 1 = Primary, 2 = Secondary, etc.
    multiplier_percentage NUMERIC(5, 4) NOT NULL CHECK (multiplier_percentage BETWEEN 0.0000 AND 2.0000), -- 1.0000 = 100%, 0.5000 = 50%
    subsequent_units_multiplier NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,  -- Multiplier for additional units on same line
    applies_to_device BOOLEAN NOT NULL DEFAULT false,                    -- Never true for Medicare
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_tier UNIQUE (rule_set_id, tier_rank)
);

CREATE INDEX IF NOT EXISTS idx_mppr_rules_tier 
    ON public.multiple_procedure_rules(rule_set_id, tier_rank);
```

---

### Table 3: `public.cms_endoscopy_families`
Stores CMS statutory endoscopy base-code groupings for difference pricing (42 CFR § 416.172(c)).

```sql
CREATE TABLE IF NOT EXISTS public.cms_endoscopy_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id INTEGER NOT NULL,                                         -- e.g., Family 15 (Colonoscopy)
    family_name VARCHAR(150) NOT NULL,                                  -- e.g., 'Lower GI Endoscopy'
    member_cpt_code VARCHAR(5) NOT NULL,                                -- e.g., '45380', '45381'
    base_cpt_code VARCHAR(5) NOT NULL,                                  -- e.g., '45378'
    effective_year INTEGER NOT NULL DEFAULT 2026,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_endoscopy_member_year UNIQUE (member_cpt_code, effective_year)
);

CREATE INDEX IF NOT EXISTS idx_endoscopy_member 
    ON public.cms_endoscopy_families(member_cpt_code, effective_year);
```

---

### Table 4: `public.mppr_calculation_snapshots` (Header Audit Record)
Stores immutable encounter-level MPPR financial audits.

```sql
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

CREATE INDEX IF NOT EXISTS idx_mppr_snapshot_surgery 
    ON public.mppr_calculation_snapshots(surgery_id, created_at DESC);
```

---

### Table 5: `public.mppr_calculation_lines` (Line-Item Audit Record)
Stores line-item calculations showing step-by-step reduction mechanics.

```sql
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
    rank_order INTEGER NOT NULL,                                         -- 1 = Primary, 2 = Secondary, etc.
    reduction_multiplier NUMERIC(5, 4) NOT NULL,                        -- 1.0000, 0.5000, 0.2500, 0.0000
    reduced_service_share NUMERIC(10, 2) NOT NULL,
    final_line_allowable NUMERIC(10, 2) NOT NULL,
    reduction_discount_amount NUMERIC(10, 2) NOT NULL,
    reduction_rationale TEXT NOT NULL,                                   -- e.g., 'Primary procedure paid at 100%', 'Secondary J8: Device 100% + Service 50%'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_snapshot_line UNIQUE (snapshot_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_mppr_lines_snapshot 
    ON public.mppr_calculation_lines(snapshot_id, rank_order);
```

---

## 2. Server-Side Stored Procedure Contracts (RPC)

### Stored Procedure: `public.fn_calculate_mppr_reimbursement`
Authoritative server-side calculation engine. Accepts encounter lines and returns exact line-by-line ranked calculations.

```sql
CREATE OR REPLACE FUNCTION public.fn_calculate_mppr_reimbursement(
    p_facility_id UUID,
    p_payer_id UUID,
    p_dos DATE,
    p_lines JSONB,                 -- Array of { cpt_code, units, modifiers, gross_charge }
    p_persist_snapshot BOOLEAN DEFAULT false,
    p_surgery_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Implementation resolves applicable rule set, wage index, payment indicators,
    -- sorts by authoritative rate DESC, applies 42 CFR 416.172, and optionally writes snapshot.
BEGIN
    -- Contract guarantees JSONB return with header summary and lines array.
END;
$$;
```

---

## 3. Client Service Layer Contract (`src/lib/mpprService.js`)

```javascript
/**
 * Authoritative Multiple Procedure Payment Rules Client Service
 */
export const mpprService = {
  /**
   * Resolves authoritative MPPR reimbursement for an encounter
   */
  async calculateEncounterMppr({ facilityId, payerId, dateOfService, procedureLines, surgeryId }) {
    // Dispatches to supabase.rpc('fn_calculate_mppr_reimbursement')
    // Returns { totalAllowable, mpprSavings, lines: [...] }
  },

  /**
   * Retrieves active rule sets for facility
   */
  async getRuleSets(facilityId) {
    // Queries public.multiple_procedure_rule_sets
  },

  /**
   * Retrieves immutable calculation snapshot by surgery ID
   */
  async getSnapshotBySurgeryId(surgeryId) {
    // Queries public.mppr_calculation_snapshots with join to lines
  }
};
```
