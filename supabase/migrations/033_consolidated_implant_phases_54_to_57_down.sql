-- ==============================================================================
-- MIGRATION DOWN: 032_facility_implant_pricing_down.sql
-- DESCRIPTION: Safely tear down Phase 57 Facility Implant Pricing tables,
--              triggers, procedures, and RLS policies in reverse dependency order.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Triggers
DROP TRIGGER IF EXISTS trg_lock_case_cost ON public.case_device_cost_allocations;
DROP FUNCTION IF EXISTS public.fn_prevent_locked_case_cost_mutation();

DROP TRIGGER IF EXISTS trg_sync_surgery_implants_cost ON public.case_devices;
DROP FUNCTION IF EXISTS public.fn_sync_surgery_implants_cost();

DROP FUNCTION IF EXISTS public.fn_resolve_sku_price_hierarchy(UUID, UUID, DATE);

-- 2. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.facility_implant_price_audits CASCADE;
DROP TABLE IF EXISTS public.implant_benchmark_prices CASCADE;
DROP TABLE IF EXISTS public.case_device_cost_allocations CASCADE;
DROP TABLE IF EXISTS public.implant_supplier_invoice_lines CASCADE;
DROP TABLE IF EXISTS public.implant_supplier_invoices CASCADE;
DROP TABLE IF EXISTS public.facility_implant_sku_prices CASCADE;
DROP TABLE IF EXISTS public.facility_implant_price_schedules CASCADE;

COMMIT;
-- ==============================================================================
-- DOWN MIGRATION: 031_facility_vendor_contracts_down.sql
-- DESCRIPTION: Safely roll back Phase 56 Facility Vendor Contracts.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_validate_contract_eligibility(UUID, UUID, UUID, UUID, DATE);
DROP FUNCTION IF EXISTS public.fn_create_contract_amendment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_review_facility_vendor_contract(UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.fn_upsert_facility_vendor_contract(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, BOOLEAN, INTEGER, VARCHAR, INTEGER, NUMERIC, INTEGER, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, NUMERIC, BOOLEAN, VARCHAR, NUMERIC, TEXT);

-- 2. Drop Foreign Key on case_devices if attached
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_contract_id'
    ) THEN
        ALTER TABLE public.case_devices DROP CONSTRAINT fk_case_devices_contract_id;
    END IF;
END $$;

-- 3. Drop Triggers & Trigger Functions
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contracts ON public.facility_vendor_contracts;

DROP TRIGGER IF EXISTS trg_enforce_contract_approval_separation ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_enforce_contract_approval_separation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_contracts ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_prevent_facility_relocation_contracts();

DROP TRIGGER IF EXISTS trg_prevent_active_contract_delete ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_prevent_active_contract_delete();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contracts ON public.facility_vendor_contracts;

-- 4. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.facility_vendor_contract_documents CASCADE;
DROP TABLE IF EXISTS public.facility_vendor_contract_scopes CASCADE;
DROP TABLE IF EXISTS public.facility_vendor_contracts CASCADE;

COMMIT;
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
