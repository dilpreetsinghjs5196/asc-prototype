-- ==============================================================================
-- MIGRATION DOWN: 029_implant_product_sku_model_down.sql
-- DESCRIPTION: Rollback script for Phase 54 Implant Product SKU Model
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Foreign Key on case_devices
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_sku_id'
    ) THEN
        ALTER TABLE public.case_devices DROP CONSTRAINT fk_case_devices_sku_id;
    END IF;
END $$;

-- 2. Drop Triggers on Tables
DROP TRIGGER IF EXISTS trg_touch_implant_sku_distributor_mappings ON public.implant_sku_distributor_mappings;
DROP TRIGGER IF EXISTS trg_touch_implant_product_skus ON public.implant_product_skus;
DROP TRIGGER IF EXISTS trg_prevent_active_sku_delete ON public.implant_product_skus;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_skus ON public.implant_product_skus;
DROP TRIGGER IF EXISTS trg_touch_implant_product_families ON public.implant_product_families;

-- 3. Drop Stored Functions
DROP FUNCTION IF EXISTS public.fn_prevent_active_sku_hard_delete();
DROP FUNCTION IF EXISTS public.fn_prevent_facility_relocation_implant_skus();
DROP FUNCTION IF EXISTS public.fn_create_or_update_sku(UUID, UUID, UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, NUMERIC, VARCHAR);
DROP FUNCTION IF EXISTS public.fn_flag_sku_recall(UUID, VARCHAR, DATE, TEXT);
DROP FUNCTION IF EXISTS public.fn_deactivate_implant_sku(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_reactivate_implant_sku(UUID);

-- 4. Drop RLS Policies
DROP POLICY IF EXISTS "implant_sku_distributor_mappings_select" ON public.implant_sku_distributor_mappings;
DROP POLICY IF EXISTS "implant_sku_distributor_mappings_modify" ON public.implant_sku_distributor_mappings;
DROP POLICY IF EXISTS "implant_product_skus_select" ON public.implant_product_skus;
DROP POLICY IF EXISTS "implant_product_skus_modify" ON public.implant_product_skus;
DROP POLICY IF EXISTS "implant_product_families_select" ON public.implant_product_families;
DROP POLICY IF EXISTS "implant_product_families_modify" ON public.implant_product_families;

-- 5. Drop Indexes
DROP INDEX IF EXISTS public.uq_distributor_sku_mapping;
DROP INDEX IF EXISTS public.uq_sku_vendor_catalog;
DROP INDEX IF EXISTS public.uq_product_family_code;

-- 6. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.implant_sku_distributor_mappings CASCADE;
DROP TABLE IF EXISTS public.implant_product_skus CASCADE;
DROP TABLE IF EXISTS public.implant_product_families CASCADE;

COMMIT;
