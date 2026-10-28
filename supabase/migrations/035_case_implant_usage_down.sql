-- ==============================================================================
-- ROLLBACK MIGRATION: 035_case_implant_usage_down.sql
-- DESCRIPTION: Rollback Phase 59 Case Implant Usage hardening and support tables.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures & Functions
DROP FUNCTION IF EXISTS public.fn_search_implant_recalls(UUID, UUID, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.fn_amend_case_device(UUID, VARCHAR, TEXT, VARCHAR, TEXT, UUID);

-- 2. Drop Support Tables
DROP TABLE IF EXISTS public.case_implant_scans CASCADE;
DROP TABLE IF EXISTS public.case_device_amendments CASCADE;

-- 3. Drop Constraints on case_devices
ALTER TABLE IF EXISTS public.case_devices
    DROP CONSTRAINT IF EXISTS chk_case_device_quantity_balance,
    DROP CONSTRAINT IF EXISTS chk_case_device_waste_attribution;

-- 4. Drop Indexes on case_devices
DROP INDEX IF EXISTS public.idx_case_devices_udi_di;
DROP INDEX IF EXISTS public.idx_case_devices_lot_number;
DROP INDEX IF EXISTS public.idx_case_devices_serial_number;
DROP INDEX IF EXISTS public.idx_case_devices_sku;
DROP INDEX IF EXISTS public.idx_case_devices_sourcing;
DROP INDEX IF EXISTS public.idx_case_devices_closed;

-- 5. Drop Additive Columns from case_devices
ALTER TABLE IF EXISTS public.case_devices
    DROP COLUMN IF EXISTS quantity_opened,
    DROP COLUMN IF EXISTS quantity_implanted,
    DROP COLUMN IF EXISTS quantity_wasted,
    DROP COLUMN IF EXISTS quantity_returned,
    DROP COLUMN IF EXISTS unit_of_measure,
    DROP COLUMN IF EXISTS package_size,
    DROP COLUMN IF EXISTS udi_di,
    DROP COLUMN IF EXISTS udi_pi,
    DROP COLUMN IF EXISTS udi_issuing_agency,
    DROP COLUMN IF EXISTS catalog_number,
    DROP COLUMN IF EXISTS serial_tracking_required,
    DROP COLUMN IF EXISTS lot_tracking_required,
    DROP COLUMN IF EXISTS waste_reason,
    DROP COLUMN IF EXISTS waste_liability,
    DROP COLUMN IF EXISTS waste_notes,
    DROP COLUMN IF EXISTS sourcing_channel,
    DROP COLUMN IF EXISTS po_number,
    DROP COLUMN IF EXISTS receiving_line_id,
    DROP COLUMN IF EXISTS verified_acquisition_cost,
    DROP COLUMN IF EXISTS cost_source_id,
    DROP COLUMN IF EXISTS is_substitution,
    DROP COLUMN IF EXISTS original_planned_sku_id,
    DROP COLUMN IF EXISTS substitution_reason,
    DROP COLUMN IF EXISTS is_closed,
    DROP COLUMN IF EXISTS closed_at,
    DROP COLUMN IF EXISTS closed_by,
    DROP COLUMN IF EXISTS amendment_version;

COMMIT;
