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
