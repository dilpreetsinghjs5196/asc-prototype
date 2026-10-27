-- ==============================================================================
-- MIGRATION DOWN: 028_implant_vendor_master_down.sql
-- DESCRIPTION: Rollback script for Phase 53 Implant Vendor Master & Relationships
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- Drop Triggers on implant_vendor_relationships
DROP TRIGGER IF EXISTS trg_audit_implant_vendor_relationships ON public.implant_vendor_relationships;
DROP TRIGGER IF EXISTS trg_touch_implant_vendor_relationships ON public.implant_vendor_relationships;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_vendor_relationships ON public.implant_vendor_relationships;

-- Drop Triggers on implant_vendors
DROP TRIGGER IF EXISTS trg_audit_implant_vendors ON public.implant_vendors;
DROP TRIGGER IF EXISTS trg_touch_implant_vendors ON public.implant_vendors;
DROP TRIGGER IF EXISTS trg_prevent_active_vendor_delete ON public.implant_vendors;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_vendors ON public.implant_vendors;

-- Drop Stored Functions
DROP FUNCTION IF EXISTS public.fn_prevent_active_vendor_hard_delete();
DROP FUNCTION IF EXISTS public.fn_prevent_facility_relocation_implant_vendors();
DROP FUNCTION IF EXISTS public.fn_create_or_update_vendor(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT[], VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.fn_deactivate_implant_vendor(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_reactivate_implant_vendor(UUID);

-- Drop RLS Policies on implant_vendor_relationships
DROP POLICY IF EXISTS "implant_vendor_relationships_select" ON public.implant_vendor_relationships;
DROP POLICY IF EXISTS "implant_vendor_relationships_modify" ON public.implant_vendor_relationships;

-- Drop RLS Policies on implant_vendors
DROP POLICY IF EXISTS "implant_vendors_select_policy" ON public.implant_vendors;
DROP POLICY IF EXISTS "implant_vendors_insert_policy" ON public.implant_vendors;
DROP POLICY IF EXISTS "implant_vendors_update_policy" ON public.implant_vendors;
DROP POLICY IF EXISTS "implant_vendors_delete_policy" ON public.implant_vendors;

-- Drop Indexes
DROP INDEX IF EXISTS public.uq_implant_vendor_legal_name;

-- Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.implant_vendor_relationships CASCADE;
DROP TABLE IF EXISTS public.implant_vendors CASCADE;

COMMIT;
