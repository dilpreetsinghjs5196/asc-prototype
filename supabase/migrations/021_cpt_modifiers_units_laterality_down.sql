-- ==============================================================================
-- MIGRATION 021 DOWN: ROLLBACK CPT MODIFIERS, UNITS & LATERALITY DETERMINISTIC RULES
-- ==============================================================================

BEGIN;

-- Drop validation functions
DROP FUNCTION IF EXISTS public.fn_validate_case_procedures(BIGINT);
DROP FUNCTION IF EXISTS public.fn_validate_procedure_line(BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, UUID);

-- Drop added columns and constraints on public.surgery_procedures
ALTER TABLE public.surgery_procedures
    DROP CONSTRAINT IF EXISTS chk_surgery_proc_val_status,
    DROP COLUMN IF EXISTS validation_status,
    DROP COLUMN IF EXISTS validation_flags,
    DROP COLUMN IF EXISTS validation_timestamp,
    DROP COLUMN IF EXISTS override_reason,
    DROP COLUMN IF EXISTS override_by,
    DROP COLUMN IF EXISTS override_at;

-- Drop RLS policies
DROP POLICY IF EXISTS rls_cbr_all ON public.cpt_billing_rules;
DROP POLICY IF EXISTS rls_cbr_select ON public.cpt_billing_rules;
DROP POLICY IF EXISTS rls_cmc_all ON public.cpt_modifier_conflicts;
DROP POLICY IF EXISTS rls_cmc_select ON public.cpt_modifier_conflicts;
DROP POLICY IF EXISTS rls_cmm_all ON public.cpt_modifier_master;
DROP POLICY IF EXISTS rls_cmm_select ON public.cpt_modifier_master;

-- Drop tables
DROP TABLE IF EXISTS public.cpt_billing_rules CASCADE;
DROP TABLE IF EXISTS public.cpt_modifier_conflicts CASCADE;
DROP TABLE IF EXISTS public.cpt_modifier_master CASCADE;

COMMIT;
