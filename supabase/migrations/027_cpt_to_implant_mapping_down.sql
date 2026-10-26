-- ==============================================================================
-- MIGRATION DOWN: 027_cpt_to_implant_mapping_down.sql
-- DESCRIPTION: Rollback script for Phase 52 CPT to Implant Mapping
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- Drop Trigger on public.cpt_implant_mappings
DROP TRIGGER IF EXISTS trg_audit_cpt_implant_mappings ON public.cpt_implant_mappings;
DROP TRIGGER IF EXISTS trg_touch_cpt_implant_mappings ON public.cpt_implant_mappings;
DROP TRIGGER IF EXISTS trg_validate_cpt_implant_mapping ON public.cpt_implant_mappings;

-- Drop Stored Functions
DROP FUNCTION IF EXISTS public.fn_validate_cpt_implant_mapping_integrity();
DROP FUNCTION IF EXISTS public.fn_resolve_cpt_implant_requirements(VARCHAR, UUID, DATE);

-- Drop RLS Policies
DROP POLICY IF EXISTS "cpt_implant_mappings_facility_isolation" ON public.cpt_implant_mappings;
DROP POLICY IF EXISTS "cpt_implant_mapping_reviews_isolation" ON public.cpt_implant_mapping_reviews;
DROP POLICY IF EXISTS rls_cpt_implant_mappings_select ON public.cpt_implant_mappings;
DROP POLICY IF EXISTS rls_cpt_implant_mappings_insert ON public.cpt_implant_mappings;
DROP POLICY IF EXISTS rls_cpt_implant_mappings_update ON public.cpt_implant_mappings;
DROP POLICY IF EXISTS rls_cpt_implant_mappings_delete ON public.cpt_implant_mappings;

DROP POLICY IF EXISTS rls_cpt_implant_mapping_reviews_select ON public.cpt_implant_mapping_reviews;
DROP POLICY IF EXISTS rls_cpt_implant_mapping_reviews_insert ON public.cpt_implant_mapping_reviews;

-- Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.cpt_implant_mapping_reviews CASCADE;
DROP TABLE IF EXISTS public.cpt_implant_mappings CASCADE;

COMMIT;
