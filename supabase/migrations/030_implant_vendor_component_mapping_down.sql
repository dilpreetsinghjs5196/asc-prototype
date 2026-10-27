-- ==============================================================================
-- DOWN MIGRATION: 030_implant_vendor_component_mapping_down.sql
-- DESCRIPTION: Safely roll back Phase 55 Vendor-to-Implant Component Mappings.
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_change_mapping_preference_tier(UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.fn_reactivate_vendor_component_mapping(UUID);
DROP FUNCTION IF EXISTS public.fn_deactivate_vendor_component_mapping(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_upsert_vendor_component_mapping(UUID, UUID, UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, INTEGER, BOOLEAN, DATE, DATE, TEXT, TEXT);

-- 2. Drop Triggers & Trigger Functions
DROP TRIGGER IF EXISTS trg_audit_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_mappings ON public.implant_vendor_component_mappings;
DROP FUNCTION IF EXISTS public.fn_prevent_facility_relocation_implant_mappings();
DROP TRIGGER IF EXISTS trg_prevent_active_mapping_delete ON public.implant_vendor_component_mappings;
DROP FUNCTION IF EXISTS public.fn_prevent_active_mapping_hard_delete();
DROP TRIGGER IF EXISTS trg_touch_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;

-- 3. Drop Table & Dependent Objects
DROP TABLE IF EXISTS public.implant_vendor_component_mappings CASCADE;

COMMIT;
