-- ==============================================================================
-- REVERT MIGRATION: 026_implant_category_and_component_model_down.sql
-- DESCRIPTION: Reverts Phase 51 Implant Category and Component Model
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_audit_implant_components ON public.implant_components;
DROP TRIGGER IF EXISTS trg_audit_implant_categories ON public.implant_categories;
DROP TRIGGER IF EXISTS trg_touch_implant_components ON public.implant_components;
DROP TRIGGER IF EXISTS trg_touch_implant_categories ON public.implant_categories;
DROP TRIGGER IF EXISTS trg_restrict_active_category_deactivation ON public.implant_categories;
DROP TRIGGER IF EXISTS trg_prevent_circular_category_hierarchy ON public.implant_categories;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_restrict_active_category_deactivation();
DROP FUNCTION IF EXISTS public.fn_prevent_circular_category_hierarchy();

-- Drop tables
DROP TABLE IF EXISTS public.implant_components CASCADE;
DROP TABLE IF EXISTS public.implant_categories CASCADE;

COMMIT;
