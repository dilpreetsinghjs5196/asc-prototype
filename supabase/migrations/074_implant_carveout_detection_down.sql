-- ==============================================================================
-- DOWN MIGRATION: 074_implant_carveout_detection_down.sql
-- DESCRIPTION: Rollback Phase 97 Implant Carveout Detection schema objects.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

DROP VIEW IF EXISTS public.vw_implant_carveout_summary CASCADE;
DROP VIEW IF EXISTS public.vw_implant_carveout_active CASCADE;

DROP POLICY IF EXISTS implant_carveout_discrepancies_isolation ON public.implant_carveout_discrepancies;
DROP POLICY IF EXISTS implant_carveout_rules_isolation ON public.implant_carveout_rules;

DROP TABLE IF EXISTS public.implant_carveout_discrepancies CASCADE;
DROP TABLE IF EXISTS public.implant_carveout_rules CASCADE;

COMMIT;
